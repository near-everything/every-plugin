export const PRODUCT_MERGES: Record<string, string[]> = {
    // Target Product ID -> Source Product IDs (to be merged into target)
    "printful-product-406665405": ["printful-product-406665571"],
    "printful-product-406653757": ["printful-product-406653292", "printful-product-406654379"],
    "printful-product-406655640": ["printful-product-406646390"],
};

export const HIDDEN_PRODUCT_IDS = [
    ...Object.values(PRODUCT_MERGES).flat(),
];

export const MERGE_TARGET_IDS = Object.keys(PRODUCT_MERGES);

export function getMergeTargetId(productId: string): string | undefined {
    if (MERGE_TARGET_IDS.includes(productId)) return productId;

    for (const [targetId, sourceIds] of Object.entries(PRODUCT_MERGES)) {
        if (sourceIds.includes(productId)) {
            return targetId;
        }
    }
    return undefined;
}
