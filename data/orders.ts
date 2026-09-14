/**
 * Orders, as stored (one JSON document per row in `orders`) and as sent to
 * the storefront and the admin panel.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export type PaymentStatus = "unpaid" | "paid" | "refunded";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
];

export const orderStatusLabel: Record<OrderStatus, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "مؤكد",
  preparing: "قيد التجهيز",
  shipped: "في الطريق",
  delivered: "تم التسليم",
  cancelled: "ملغي",
  returned: "مرتجع",
};

export const orderStatusTone: Record<OrderStatus, "accent" | "success" | "muted" | "ink" | "danger"> = {
  pending: "accent",
  confirmed: "ink",
  preparing: "ink",
  shipped: "accent",
  delivered: "success",
  cancelled: "danger",
  returned: "muted",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  unpaid: "غير مدفوع",
  paid: "مدفوع",
  refunded: "مسترجع",
};

/** Where the order is in its life, for the customer's tracking view. */
export const ORDER_PROGRESS: OrderStatus[] = ["pending", "confirmed", "preparing", "shipped", "delivered"];

export interface OrderItem {
  productId: string;
  /** Snapshot at order time: the catalogue can change afterwards. */
  name: string;
  brand: string;
  sku?: string;
  slug: string;
  image: string;
  unitPrice: number;
  quantity: number;
  /** Chosen colour name, when the product offers more than one. */
  color?: string;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  governorate: string;
  city: string;
  address: string;
  notes: string;
}

export interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  deliveryFee: number;
  total: number;
  /** Snapshot of the chosen method, so a renamed method still reads. */
  payment: { id: string; label: string; instructions: string };
  adminNotes: string;
  /** Timeline of status changes, newest last. */
  history: { status: OrderStatus; at: string; note?: string }[];
  createdAt: string;
  updatedAt: string;
}

/** What the storefront submits — the server prices it. */
export interface OrderRequest {
  customer: OrderCustomer;
  items: { productId: string; quantity: number; color?: string }[];
  paymentMethodId: string;
  couponCode?: string;
}
