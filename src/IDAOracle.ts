import {
    Field,
} from 'snarkyjs';

import { BinaryMerkleProof } from './lib/BinaryMerkleTree';
import { DataRootTuple } from './DataRootTuple';

/**
 * @notice Data Availability Oracle interface.
 */
export interface IDAOracle {
    verifyAttestation: (_tupleRootNonce: Field, _tuple: DataRootTuple, _proof: BinaryMerkleProof) => boolean
}