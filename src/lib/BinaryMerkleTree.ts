import {
    Field,
    isReady,
    Bool,
    Experimental,
    Poseidon,
    Circuit,
    UInt32,
    SelfProof,
    Struct,
    MerkleTree,
    MerkleWitness,
} from 'snarkyjs';

import Sha256, {
    sha256,
    Hash,
    Chunk
} from "../../snarkyjs-sha256/src/sha256";

import * as Constants from "./Constants";

import { pathLengthFromKey } from "./Utils";

/**
 * NOTE: Need to differentiate between what a bytes32 and what a bytes (byte[]) values 
 * are and their respective snarkyJS equivalents
 */

/**
 * Calculate the digest of a node.
 * @param left The left child.
 * @param right The right child.
 * @return digest The node digest.
 * @dev More details in https://github.com/celestiaorg/celestia-specs/blob/master/src/specs/data_structures.md#binary-merkle-tree
 */
function nodeDigest(left: Field, right: Field): Field {
    const chunk = Chunk.fromBuffer256(Buffer.from(sha256(Constants.NODE_PREFIX.toString() + left.toString() + right.toString()), 'hex'));
    return Field(Sha256.sha256([chunk]).toString())
}

/**
 * Calculate the digest of a node.
 * @param data The data of the leaf.
 * @return digest The leaf digest.
 * @dev  More details in https://github.com/celestiaorg/celestia-specs/blob/master/src/specs/data_structures.md#binary-merkle-tree
 */
function leafDigest(data: Array<Field>): Field {
    const chunk = Chunk.fromBuffer256(Buffer.from(sha256(Constants.LEAF_PREFIX.toString() + data.toString()), 'hex'));
    return Field(Sha256.sha256([chunk]).toString())
}
/**
 * Merkle Tree Proof structure for Celestia QGB
 */
export type BinaryMerkleProof = {
    sideNodes: Array<Field>,
    key: Field,
    numOfLeaves: Field,
}
/**
 * Verify if element exists in Merkle tree, given data, proof, and root.
 * @param {Field} The root of the tree in which verify the given leaf.
 * @param {BinaryMerkleProof} Binary Merkle proof for the leaf.
 * @param {Array<Field>} The data of the leaf to verify
 */
export function verify(root: Field, proof: BinaryMerkleProof, data: Array<Field>): Bool {
    // Check proof is correct length for the key it is proving
    if (proof.numOfLeaves.lte(1)) {
        if (proof.sideNodes.length != 0) {
            return Bool(false)
        }
    } else if (Field(proof.sideNodes.length).equals(pathLengthFromKey(proof.key, proof.numOfLeaves)).not()) {
        return Bool(false)
    }

    // Check key is in tree
    if (proof.key.gte(proof.numOfLeaves)) {
        return Bool(false);
    }

    // A sibling at height 1 is created by getting the hash of the data to prove.
    let digest = leafDigest(data);

    // Null proof is only valid if numLeaves = 1
    // If so, just verify hash(data) is root
    if (proof.sideNodes.length == 0) {
        if (proof.numOfLeaves.equals(1)) {
            return root.equals(digest);
        } else {
            return Bool(false);
        }
    }

    let height = Field(1);
    let stableEnd = proof.key;

    // While the current subtree (of height 'height') is complete, determine
    // the position of the next sibling using the complete subtree algorithm.
    // 'stableEnd' tells us the ending index of the last full subtree. It gets
    // initialized to 'key' because the first full subtree was the
    // subtree of height 1, created above (and had an ending index of
    // 'key').
    while (true) {
        // Determine if the subtree is complete. This is accomplished by
        // rounding down the key to the nearest 1 << 'height', adding 1
        // << 'height', and comparing the result to the number of leaves in the
        // Merkle tree.

        let subTreeStartIndex = (proof.key.div(Field(BigInt(1) << height.toBigInt()))).mul(Field(BigInt(1) << height.toBigInt()));
        let subTreeEndIndex = subTreeStartIndex.add(Field(BigInt(1) << height.toBigInt())).sub(1);

        // If the Merkle tree does not have a leaf at index
        // 'subTreeEndIndex', then the subtree of the current height is not
        // a complete subtree.
        if (subTreeEndIndex.gte(proof.numOfLeaves)) {
            break;
        }

        stableEnd = subTreeEndIndex;

        // Determine if the key is in the first or the second half of
        // the subtree.
        if (proof.sideNodes.length <= height.toBigInt() - BigInt(1)) {
            return Bool(false);
        }
        if (proof.key.sub(subTreeStartIndex).lt(Field(BigInt(1) << height.toBigInt()).sub(1))) {
            digest = nodeDigest(digest, proof.sideNodes[Number(height.toBigInt() - BigInt(1))]);
        } else {
            digest = nodeDigest(proof.sideNodes[Number(height.toBigInt() - BigInt(1))], digest);
        }

        height.add(1);
    }

    // Determine if the next hash belongs to an orphan that was elevated. This
    // is the case IFF 'stableEnd' (the last index of the largest full subtree)
    // is equal to the number of leaves in the Merkle tree.
    if (stableEnd.equals(proof.numOfLeaves.sub(1)).not()) {
        if (proof.sideNodes.length <= Number(height.toBigInt()) - 1) {
            return Bool(false);
        }
        digest = nodeDigest(digest, proof.sideNodes[Number(height.toBigInt() - BigInt(1))])
    }

    // All remaining elements in the proof set will belong to a left sibling\
    // i.e proof sideNodes are hashed in "from the left"
    while (height.sub(1).lt(proof.sideNodes.length)) {
        digest = nodeDigest(proof.sideNodes[Number(height.toBigInt() - BigInt(1))], digest);
        height.add(1);
    }

    return root.equals(digest);
}