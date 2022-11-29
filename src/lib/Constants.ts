import {
    Field,
} from 'snarkyjs';

/**
 * Maximum tree height
 */
export const MAX_HEIGHT = Field(256)

/**
 * The prefixes of leaves and nodes
 */
export const LEAF_PREFIX = 0x00;
export const NODE_PREFIX = 0x01;

/**
 * Parity share namespace ID
 */
export const PARITY_SHARE_NAMESPACE_ID = 0xFFFFFFFFFFFFFFFF;