export * from './keys';
import type { ProductCategory } from './keys';

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  size: string;
}

export const COLLECTIONS: ProductCategory[] = ['Men', 'Women', 'Accessories', 'Exclusives'];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];

export const requiresSize = (category: ProductCategory): boolean => {
  return ['Men', 'Women', 'Exclusives'].includes(category);
};

export {
  useProducts,
  useProduct,
  useSuspenseProduct,
  useFeaturedProducts,
  useSuspenseFeaturedProducts,
  useSearchProducts,
  useSuspenseSearchProducts,
  useProductsByIds,
  productLoaders,
  type Product,
  type ProductImage,
} from './products';

export {
  useCollections,
  useSuspenseCollections,
  useCollection,
  useSuspenseCollection,
  collectionLoaders,
  type Collection,
} from './collections';

export {
  useOrders,
  useSuspenseOrders,
  useOrder,
  useSuspenseOrder,
  useOrderByCheckoutSession,
  orderLoaders,
  type Order,
} from './orders';

export {
  useCreateCheckout,
  type CreateCheckoutInput,
  type CreateCheckoutOutput,
} from './checkout';
