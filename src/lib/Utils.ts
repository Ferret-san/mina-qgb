import {
    Field
} from 'snarkyjs';

import * as Constants from "./Constants";

/**
 * Calculate the starting bit of the path to a leaf
 * @param {Field} The total number of leaves in the tree
 * @return {Field} The starting bit of the path
 */
export function getStartingBit(numOfLeaves: Field): Field {
    // Determine height of the left subtree. This is the maximum path length, so all paths start at this offset from the right-most bit
    let startingBit = BigInt(0);
    while ((BigInt(1) << startingBit) < numOfLeaves.toBigInt()) {
        startingBit += BigInt(1);
    }

    return Constants.MAX_HEIGHT.sub(Field(startingBit));
}

/**
 * Calculate the length of the path to a leaf
 * @param {Field} The kay of the leaf
 * @param {Field} The total number of leave sin the tree
 * @return {Field} The length of the path to the leaf
 * @dev A precondition to this function is that `numLeaves > 1`, so that `(pathLength - 1)` does not cause an underflow when pathLength = 0.
 */
export function pathLengthFromKey(key: Field, numOfLeaves: Field): Field {
    // Get the height of the left subtree. This is equal to the offset of the starting bit of the path
    let pathLength = Constants.MAX_HEIGHT.sub(getStartingBit(numOfLeaves));

    // Determine the number of leaves in the left subtree
    let numOfLeavesLeftSubTree = (BigInt(1) << (pathLength.toBigInt() - BigInt(1)));

    // If leaf is in left subtree, path length is full height of left subtree
    if (key.lte(Field(numOfLeavesLeftSubTree - BigInt(1)))) {
        return pathLength
    }
    // If left sub tree has only one leaf but key is not there, path has one additional step
    else if (numOfLeavesLeftSubTree == BigInt(1)) {
        return Field(1);
    }
    // Otherwise, add 1 to height and recurse into right subtree
    else {
        return Field(1).add(pathLengthFromKey(key.sub(Field(numOfLeavesLeftSubTree)), numOfLeaves.sub(Field(numOfLeavesLeftSubTree))));
    }



}