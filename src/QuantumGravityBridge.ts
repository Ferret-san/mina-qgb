import { constants } from 'buffer';
import {
    Field,
    State,
    state,
    isReady,
    Bool,
    Experimental,
    Poseidon,
    Circuit,
    UInt32,
    SelfProof,
    Struct,
    Signature,
    MerkleTree,
    MerkleWitness,
    MerkleMapWitness,
    PublicKey,
    SmartContract,
    method
} from 'snarkyjs';

import Sha256, {
    sha256,
    Hash,
    Chunk
} from "../snarkyjs-sha256/src/sha256";
import * as Constants from './Constants';
import { DataRootTuple } from './DataRootTuple';
import { IDAOracle } from './IDAOracle';
import { BinaryMerkleProof, verify } from './lib/BinaryMerkleTree';

type Validator = {
    // Note: this is meant to represent the address of the Celestia validator
    // as such this PublicKey might not be the correct type
    addr: PublicKey,
    power: Field,
}

/**
 * @title Quantum Gravity Bridge: Celestia -> EVM, Data Availability relay.
 * @dev The relay relies on a set of signers to attest to some event on
 * Celestia. These signers are the Celestia validator set, who sign over every
 * Celestia block. Keeping track of the Celestia validator set is accomplished
 * by updating this contract's view of the validator set with
 * `updateValidatorSet()`. At least 2/3 of the voting power of the current
 * view of the validator set must sign off on new relayed events, submitted
 * with `submitDataRootTupleRoot()`. Each event is a batch of `DataRootTuple`s
 * (see ./DataRootTuple.sol), with each tuple representing a single data root
 * in a Celestia block header. Relayed tuples are in the same order as the
 * block headers.
 */
export class QuantumGravityBridge extends SmartContract {
    @state(Field) BRIDGE_ID = State<Field>();
    // @notice Domain-separated commitment to the latest validator set.
    @state(Field) state_lastValidatorSetCheckpoint = State<Field>();
    // @notice Voting power required to submit a new update.
    @state(Field) state_powerThreshold = State<Field>();
    // @notice Nonce for bridge events. Must be incremented sequentially.
    @state(Field) state_eventNonce = State<Field>();
    // @notice Mapping of data root tuple root nonces to data root tuple roots.
    @state(Field) mapRoot = State<Field>();

    // TODO: Add events

    @method init(_bridge_id: Field, _nonce: Field, _powerTreshold: Field, _validatorSetHash: Field) {
        this.BRIDGE_ID.set(_bridge_id);

        let newCheckPoint = this.domainSeparateValidatorSetHash(_bridge_id, _nonce, _powerTreshold, _validatorSetHash);

        this.state_eventNonce.set(_nonce);
        this.state_lastValidatorSetCheckpoint.set(newCheckPoint);
        this.state_powerThreshold.set(_powerTreshold);

        // this.emitEvent('ValidatorSetUpdatedEvent', (_nonce, _powerThreshold, _validatorSetHash));
    }

    @method domainSeparateValidatorSetHash(_bridge_id: Field, _nonce: Field, _powerThreshold: Field, _validatorSetHash: Field): Field {
        // NOTE: this should be replaced with Keccak256
        let chunk = Chunk.fromBuffer256(
            Buffer.from(
                sha256(
                    this.BRIDGE_ID.toString() +
                    Constants.VALIDATOR_SET_HASH_DOMAIN_SEPARATOR.toString()) +
                _nonce.toString() +
                _powerThreshold.toString() +
                _validatorSetHash.toString(),
                'hex'));
        // NOTE: this should be replaced with Keccak256
        return Field(Sha256.sha256([chunk]).toString())
    }

    @method domainSeparateDataRootTupleRoot(_bridge_id: Field, _nonce: Field, _dataRootTupleRoot: Field): Field {
        // NOTE: this should be replaced with Keccak256
        let chunk = Chunk.fromBuffer256(
            Buffer.from(
                sha256(
                    this.BRIDGE_ID.toString() +
                    Constants.DATA_ROOT_TUPLE_ROOT_DOMAIN_SEPARATOR.toString()) +
                _nonce.toString() +
                _dataRootTupleRoot.toString(),
                'hex'));
        // NOTE: this should be replaced with Keccak256
        return Field(Sha256.sha256([chunk]).toString())
    }

    @method computeValidatorSetHash(_validators: Validator[]): Field {
        // Do some naive encoding just to please the compiler and make it shut up
        let setHash = '';
        for (var i = 0; i < _validators.length; i++) {
            setHash += _validators[i].addr.toBase58() + _validators[i].power.toString()
        }
        // NOTE: this should be replaced with Keccak256
        let chunk = Chunk.fromBuffer256(
            Buffer.from(
                sha256(
                    setHash),
                'hex'));
        // NOTE: this should be replaced with Keccak256
        return Field(Sha256.sha256([chunk]).toString())
    }

    @method checkValidatorSignatures(_currentValidators: Validator[], _sigs: Signature[], _digest: Field, _powerTreshold: Field) {
        let cumulativePower = Field(0);

        for (var i = 0; i < _currentValidators.length; i++) {
            let isVerified = _sigs[i].verify(_currentValidators[i].addr, [_digest]);
            isVerified.assertTrue();

            cumulativePower.add(_currentValidators[i].power);

            if (cumulativePower.gte(_powerTreshold)) {
                break
            }
        }

        // If the assertion fails, tghen we do nopt have enough power
        cumulativePower.assertGte(_powerTreshold);
    }

    @method updateValidatorSet(_newNonce: Field, _oldNonce: Field, _newPowerThreshold: Field, _newValidatorSetHash: Field, _currentValidatorSet: Validator[], _sigs: Signature[]) {
        let currenNonce = this.state_eventNonce.get();
        this.state_eventNonce.assertEquals(currenNonce);
        let currentPowerTreshold = this.state_powerThreshold.get();
        this.state_powerThreshold.assertEquals(currentPowerTreshold);

        // Check that the new nonce is one more than the current one.
        let nonceCheck = currenNonce;
        nonceCheck.add(1);
        _newNonce.assertEquals(nonceCheck);

        // Check that current validators and signatures are well-formed.
        Field(_currentValidatorSet.length).assertEquals(Field(_sigs.length));

        // Check that the supplied current validator set matches the saved checkpoint.
        let currentValidatorSetHash = this.computeValidatorSetHash(_currentValidatorSet);
        this.state_lastValidatorSetCheckpoint.assertEquals(
            this.domainSeparateValidatorSetHash(
                this.BRIDGE_ID.get(),
                _oldNonce,
                currentPowerTreshold,
                currentValidatorSetHash
            )
        );

        // Check that enough current validators have signed off on the new validator set.
        let newCheckPoint = this.domainSeparateValidatorSetHash(this.BRIDGE_ID.get(), _newNonce, _newPowerThreshold, _newValidatorSetHash);
        this.checkValidatorSignatures(_currentValidatorSet, _sigs, newCheckPoint, currentPowerTreshold);

        this.state_lastValidatorSetCheckpoint.set(newCheckPoint);
        this.state_powerThreshold.set(_newPowerThreshold);
        this.state_eventNonce.set(_newNonce);

        //this.emitEvent('ValidatorSetUpdatedEvent', (_newNonce, _newPowerThreshold, _newValidatorSetHash));
    }

    @method submitDataRootTupleRoot(
        _newNonce: Field,
        _validatorSetNonce: Field,
        _dataRootTupleRoot: Field,
        _currentValidatorSet: Validator[],
        _sigs: Signature[],
        _mapWitness: MerkleMapWitness,
        _valueBefore: Field,
    ) {
        const initialRoot = this.mapRoot.get();
        this.mapRoot.assertEquals(initialRoot);

        let currenNonce = this.state_eventNonce.get();
        let currentPowerTreshold = this.state_powerThreshold.get();

        // Check that the new nonce is one more than the current one.
        let nonceCheck = currenNonce;
        nonceCheck.add(1);
        _newNonce.assertEquals(nonceCheck);

        // Check that current validators and signatures are well-formed.
        Field(_currentValidatorSet.length).assertEquals(Field(_sigs.length));

        // Check that the supplied current validator set matches the saved checkpoint.
        let currentValidatorSetHash = this.computeValidatorSetHash(_currentValidatorSet);
        this.state_lastValidatorSetCheckpoint.assertEquals(
            this.domainSeparateValidatorSetHash(
                this.BRIDGE_ID.get(),
                _validatorSetNonce,
                currentPowerTreshold,
                currentValidatorSetHash
            )
        );

        // Check that enough current validators have signed off on the data
        // root tuple root and nonce.
        let c = this.domainSeparateDataRootTupleRoot(this.BRIDGE_ID.get(), _newNonce, _dataRootTupleRoot);
        this.checkValidatorSignatures(_currentValidatorSet, _sigs, c, currentPowerTreshold);

        this.state_eventNonce.set(_newNonce);
        // check the initial state matches what we expect
        const [rootBefore, key] = _mapWitness.computeRootAndKey(_valueBefore);
        rootBefore.assertEquals(initialRoot);

        key.assertEquals(_newNonce);

        // compute the root after the change
        const [rootAfter, _] = _mapWitness.computeRootAndKey(_dataRootTupleRoot);

        // set the new root
        this.mapRoot.set(rootAfter);

        // this.emitEvent('DataRootTupleRootEvent', (_newNonce, _dataRootTupleRoot));
    }

    @method verifyAttestation(_mapWitness: MerkleMapWitness, _tupleRootNonce: Field, _tuple: DataRootTuple, _proof: BinaryMerkleProof, _root: Field): Bool {
        const initialRoot = this.mapRoot.get();
        this.mapRoot.assertEquals(initialRoot);
        // Tuple must have been committed before.
        if (_tupleRootNonce.lt(this.state_eventNonce.get())) return Bool(false);

        // Note: Would be better to find a way where the value below is loaded from storage, rather than bringing it as a function param
        // check the initial state matches what we expect
        const [root, key] = _mapWitness.computeRootAndKey(_root)
        root.assertEquals(initialRoot);

        // Verify the proof
        // NOTE: might want to encode the data root tuple instead of passing it as an array in a naive manner
        let isProofValid = verify(root, _proof, [_tuple.height, _tuple.dataRoot]);

        return isProofValid;
    }
}
