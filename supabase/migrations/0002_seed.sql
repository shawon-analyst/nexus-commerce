-- ============================================================================
--  0002_seed.sql  ·  Demo catalogue (optional)
--  Run AFTER 0001_init.sql. Safe to re-run: it no-ops when data already exists.
-- ============================================================================

-- categories -----------------------------------------------------------------
insert into public.categories (name, slug, image_url) values
  ('Electronics',     'electronics',  'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&q=80'),
  ('Audio',           'audio',        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80'),
  ('Wearables',       'wearables',    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80'),
  ('Home & Kitchen',  'home-kitchen', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=800&q=80'),
  ('Photography',     'photography',  'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80')
on conflict (slug) do nothing;

-- products -------------------------------------------------------------------
insert into public.products (title, description, price, stock, category_id, image_url, featured, low_stock_threshold)
select v.title, v.description, v.price, v.stock, c.id, v.image_url, v.featured, 5
from (values
  ('Aurora Wireless Headphones',
   'Studio-grade 40mm drivers with adaptive noise cancellation, 40-hour battery life and plush memory-foam ear cushions. Bluetooth 5.3 multipoint pairing keeps your laptop and phone connected at once.',
   249.00, 24, 'audio',
   'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=80', true),

  ('Nova Smart Watch Series 7',
   'AMOLED always-on display, ECG + SpO2 sensors, 5ATM water resistance and 14-day battery. Tracks 120+ workout modes with GPS built in.',
   329.50, 15, 'wearables',
   'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&q=80', true),

  ('Vertex Mechanical Keyboard',
   'Hot-swappable 75% layout with gasket mount, lubed linear switches, per-key RGB and a CNC aluminium frame. Tri-mode: USB-C, 2.4Ghz and Bluetooth.',
   189.99, 8, 'electronics',
   'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=1200&q=80', true),

  ('Lumen 4K Mirrorless Camera',
   '24MP full-frame sensor, 6K open-gate video, 5-axis IBIS and dual card slots. The perfect first professional body.',
   1299.00, 4, 'photography',
   'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1200&q=80', true),

  ('Pulse Portable Speaker',
   '360-degree sound with a passive bass radiator, IP67 waterproof shell and 20-hour playtime. Pair two for true stereo.',
   119.00, 32, 'audio',
   'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=1200&q=80', false),

  ('Halo Desk Lamp Pro',
   'Flicker-free CRI 95 LED panel with wireless charging base, ambient light sensor and stepless dimming.',
   89.00, 3, 'home-kitchen',
   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=1200&q=80', false),

  ('Cobalt USB-C Hub 9-in-1',
   'Dual 4K60 HDMI, 100W pass-through charging, Gigabit ethernet, SD/microSD and three USB-A 3.2 ports in a machined aluminium shell.',
   79.95, 41, 'electronics',
   'https://images.unsplash.com/photo-1625723044792-44de16ccb4e9?w=1200&q=80', false),

  ('Terra Ceramic Coffee Set',
   'Reactive-glaze stoneware pour-over set: 600ml carafe, stainless filter and two 250ml cups. Dishwasher safe.',
   64.00, 18, 'home-kitchen',
   'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80', false),

  ('Echo Studio Monitor Headphones',
   'Reference-flat 50mm drivers with detachable coiled cable and replaceable velour pads. Built for mixing.',
   349.00, 6, 'audio',
   'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=1200&q=80', false),

  ('Slate Tablet 11"',
   '2.8K 120Hz display, Snapdragon-class octa-core, 8GB RAM and stylus support with 4096 pressure levels.',
   599.00, 12, 'electronics',
   'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=1200&q=80', false),

  ('Orbit Fitness Band',
   'Ultra-light 22g tracker with sleep staging, stress score and 21-day battery. Weighs virtually nothing on the wrist.',
   79.00, 27, 'wearables',
   'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=1200&q=80', false),

  ('Atlas Camera Backpack 25L',
   'Weather-sealed ripstop shell with a removable ICU insert that fits a gripped body plus four lenses. Airline carry-on compliant.',
   159.00, 2, 'photography',
   'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200&q=80', false)
) as v(title, description, price, stock, category_slug, image_url, featured)
join public.categories c on c.slug = v.category_slug
where not exists (select 1 from public.products);
