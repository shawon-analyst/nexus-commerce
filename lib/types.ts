/**
 * Hand-authored mirror of the SQL schema in `supabase/migrations/0001_init.sql`.
 * Regenerate automatically any time with:
 *   npx supabase gen types typescript --project-id <ref> > lib/types.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * `admin`    — the shop owner: everything, including users and roles.
 * `operator` — staff/assistant: orders, products, categories and stock, but
 *              never users and never a role change.
 * `customer` — shopper: own orders only.
 */
export type UserRole = 'admin' | 'operator' | 'customer';
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cod' | 'online' | 'bkash';

/**
 * 'unpaid'              — COD / pay-later, nothing received yet
 * 'pending_verification'— bKash transfer claimed, awaiting an admin check
 * 'paid'                — an admin confirmed the money arrived
 * 'refunded'            — returned to the shopper
 */
export type PaymentStatus = 'unpaid' | 'pending_verification' | 'paid' | 'refunded';

/**
 * Where the parcel is going, which decides the delivery charge:
 * `inside` = Inside Dhaka (৳60) · `outside` = Outside Dhaka (৳120).
 *
 * Stored as `text` + a CHECK constraint rather than a Postgres enum on purpose:
 * adding an enum value is a transactional minefield, and this list is not
 * expected to grow. The charge itself lives in `lib/utils.ts`.
 */
export type DeliveryArea = 'inside' | 'outside';

/* -------------------------------------------------------------------------- */
/*  Row shapes                                                                */
/* -------------------------------------------------------------------------- */

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  phone: string | null;
  /** OAuth picture URL, or the public URL of a file in the `avatars` bucket */
  avatar_url: string | null;
  /** Default address, offered as a prefill at checkout */
  shipping_address: string | null;
  /**
   * false = blocked (admin_set_user_active). The account keeps its history and
   * may still browse, but the middleware signs it out of /checkout, /account and
   * /admin, and `place_order()` refuses to take an order from it.
   */
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  category_id: string | null;
  image_url: string | null;
  featured: boolean;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  user_id: string | null;
  customer_name: string;
  /** Goods + delivery — the amount the customer actually pays. */
  total_amount: number;
  /** The delivery slice of `total_amount` (0 on legacy rows written before 0011). */
  shipping_fee: number;
  /** Which delivery charge was applied at checkout. */
  delivery_area: DeliveryArea;
  status: OrderStatus;
  shipping_address: string;
  phone: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  /** bKash "Send Money" transaction id, captured at checkout */
  transaction_id: string | null;
  notes: string | null;
  stock_restored: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_title: string;
  product_image: string | null;
  quantity: number;
  unit_price: number;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/*  Convenience composites used across the UI                                 */
/* -------------------------------------------------------------------------- */

export type ProductWithCategory = Product & {
  categories: Pick<Category, 'id' | 'name' | 'slug'> | null;
};

export type OrderWithItems = Order & {
  order_items: OrderItem[];
  profiles?: Pick<Profile, 'full_name' | 'email'> | null;
};

/**
 * A row of the admin users console: the profile plus the roll-up that
 * `admin_list_users()` computes in the same round trip. `order_count` and
 * `total_spent` are Postgres `bigint` / `numeric`, which arrive over the wire as
 * strings — read them through `toNumber()`.
 */
export type AdminUserRow = Profile & {
  order_count: number | string;
  total_spent: number | string;
  last_order_at: string | null;
};

export type DashboardStats = {
  total_revenue: number;
  revenue_30d: number;
  total_orders: number;
  pending_orders: number;
  active_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  total_products: number;
  out_of_stock: number;
  low_stock_count: number;
  total_customers: number;
  low_stock_products: Array<{
    id: string;
    title: string;
    stock: number;
    threshold: number;
    image_url: string | null;
  }>;
  revenue_by_day: Array<{ day: string; revenue: number; orders: number }>;
};

/* -------------------------------------------------------------------------- */
/*  Supabase generated-style Database type                                    */
/* -------------------------------------------------------------------------- */

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email?: string;
          full_name?: string | null;
          role?: UserRole;
          phone?: string | null;
          avatar_url?: string | null;
          shipping_address?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          role?: UserRole;
          phone?: string | null;
          avatar_url?: string | null;
          shipping_address?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          image_url?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          image_url?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          price?: number;
          stock?: number;
          category_id?: string | null;
          image_url?: string | null;
          featured?: boolean;
          low_stock_threshold?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          price?: number;
          stock?: number;
          category_id?: string | null;
          image_url?: string | null;
          featured?: boolean;
          low_stock_threshold?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: Order;
        Insert: {
          id?: string;
          user_id?: string | null;
          customer_name?: string;
          total_amount?: number;
          shipping_fee?: number;
          delivery_area?: DeliveryArea;
          status?: OrderStatus;
          shipping_address: string;
          phone: string;
          payment_method?: PaymentMethod;
          payment_status?: PaymentStatus;
          transaction_id?: string | null;
          notes?: string | null;
          stock_restored?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string | null;
          customer_name?: string;
          total_amount?: number;
          shipping_fee?: number;
          delivery_area?: DeliveryArea;
          status?: OrderStatus;
          shipping_address?: string;
          phone?: string;
          payment_method?: PaymentMethod;
          payment_status?: PaymentStatus;
          transaction_id?: string | null;
          notes?: string | null;
          stock_restored?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: OrderItem;
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_title?: string;
          product_image?: string | null;
          quantity: number;
          unit_price: number;
          created_at?: string;
        };
        Update: {
          product_id?: string | null;
          product_title?: string;
          product_image?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      /** admin *or* operator — "may run the shop" (orders, products, stock) */
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      place_order: {
        Args: {
          p_customer_name: string;
          p_phone: string;
          p_shipping_address: string;
          p_payment_method: string;
          p_items: Json;
          p_transaction_id?: string | null;
          p_notes?: string | null;
          p_delivery_area?: string | null;
        };
        Returns: string;
      };
      cancel_order: { Args: { p_order_id: string }; Returns: Order };
      track_order: { Args: { p_order_id: string; p_phone: string }; Returns: Json };
      verify_payment: { Args: { p_order_id: string }; Returns: Order };
      admin_dashboard_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      /* ---- user management (admin only, enforced in SQL) ------------------ */
      admin_list_users: { Args: { p_limit?: number }; Returns: AdminUserRow[] };
      admin_set_user_role: {
        Args: { p_user_id: string; p_role: UserRole };
        Returns: Profile;
      };
      admin_set_user_active: {
        Args: { p_user_id: string; p_is_active: boolean };
        Returns: Profile;
      };
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined };
    };
    Enums: {
      user_role: UserRole;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
