import {
    Field,
} from 'snarkyjs';

/**
 * A tuple of data root with metadata. Each data root is associated
 * with a Celestia block height.
 * @dev `availableDataRoot` in
 * https://github.com/celestiaorg/celestia-specs/blob/master/src/specs/data_structures.md#header
 */
export type DataRootTuple = {
    // Celestia block height the data root was included in.
    // Genesis block is height = 1.
    height: Field,
    // Data root.
    dataRoot: Field,
}