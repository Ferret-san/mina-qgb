# Quantum Gravity Bridge for Mina

Celestia's Quantum Gravity Bridge (QGB) for Mina is a Celestia -> Mina message relay, based on Celestia's Quantum Gravity Bridge implementation, [Quantum Gravity Bridge](https://github.com/celestiaorg/quantum-gravity-bridge) which is a Celestia -> EVM message relay.

## Table of Contents

- [How it works](#how-it-works)

## How it works

This implementation allows Celestia block header data roots to be relayed in one direction, from Celestia to Mina.
It does not support bridging assets such as fungible or non-fungible tokens directly, and cannot send messages from the Mina back to Celestia.

It works by relying on a set of signers to attest to some event on Celestia: the Celestia validator set.
The QGB contract keeps track of the Celestia validator set by updating its view of the validator set with `updateValidatorSet()`.
More than 2/3 of the voting power of the current view of the validator set must sign off on new relayed events, submitted with `submitDataRootTupleRoot()`.
Each event is a batch of `DataRootTuple`s, with each tuple representing a single [data root (i.e. block header)](https://celestiaorg.github.io/celestia-specs/latest/specs/data_structures.html#header).
Relayed tuples are in the same order as Celestia block headers.

### Events and messages relayed

 **Validator sets**:
 The relayer informs the QGB contract who are the current validators and their power.
 This results in an execution of the `updateValidatorSet` function.

 **Batches**:
 The relayer informs the QGB contract of new data root tuple roots.
 This results in an execution of the `submitDataRootTupleRoot` function.

