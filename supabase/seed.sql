-- =====================================================================
--  MelaStock · Datos de ejemplo
--  Ejecutar DESPUÉS de schema.sql
-- =====================================================================

insert into public.categories (name, icon, sort_order) values
  ('Roperos',     'shirt-outline',        1),
  ('Cómodas',     'albums-outline',       2),
  ('Cocinas',     'restaurant-outline',   3),
  ('Escritorios', 'desktop-outline',      4),
  ('Camas',       'bed-outline',          5),
  ('Estantes',    'library-outline',      6),
  ('Veladores',   'moon-outline',         7),
  ('Otros',       'cube-outline',         99)
on conflict (name) do nothing;

insert into public.products (name, description, category_id, price, cost, stock, min_stock) values
  ('Ropero 3 puertas 1.80 m',       'Melamina 18 mm, color nogal, 2 cajones y barra para colgar',  (select id from categories where name='Roperos'),     850.00, 520.00,  4, 2),
  ('Ropero 2 puertas 1.60 m',       'Melamina 15 mm, color blanco, con espejo',                     (select id from categories where name='Roperos'),     620.00, 380.00,  6, 2),
  ('Ropero 4 puertas 2.00 m',       'Melamina 18 mm, color chocolate, maletero superior',           (select id from categories where name='Roperos'),    1250.00, 790.00,  2, 1),
  ('Cómoda 4 cajones',              'Melamina 15 mm, correderas metálicas, color cerezo',           (select id from categories where name='Cómodas'),     380.00, 230.00,  5, 2),
  ('Cómoda 6 cajones',              'Melamina 18 mm, color blanco con tiradores negros',            (select id from categories where name='Cómodas'),     520.00, 310.00,  1, 2),
  ('Cocina modular 1.50 m',         'Mueble bajo + alto, melamina 18 mm, color haya',               (select id from categories where name='Cocinas'),    1450.00, 900.00,  2, 1),
  ('Reposteros aéreos 1.20 m',      'Melamina 15 mm, 3 puertas, color blanco',                      (select id from categories where name='Cocinas'),     480.00, 290.00,  3, 1),
  ('Escritorio 1.20 m con cajón',   'Melamina 18 mm, color roble, cajonera lateral',                (select id from categories where name='Escritorios'), 320.00, 190.00,  8, 3),
  ('Escritorio en L 1.40 m',        'Melamina 18 mm, color nogal con blanco',                       (select id from categories where name='Escritorios'), 560.00, 340.00,  3, 1),
  ('Cama 2 plazas con cajones',     'Melamina 18 mm, 4 cajones, color chocolate',                   (select id from categories where name='Camas'),       980.00, 600.00,  2, 1),
  ('Estante 5 niveles',             'Melamina 15 mm, color blanco, 1.80 m',                          (select id from categories where name='Estantes'),    260.00, 150.00, 10, 3),
  ('Velador 2 cajones',             'Melamina 15 mm, color cerezo',                                  (select id from categories where name='Veladores'),   140.00,  80.00, 12, 4),
  ('Zapatera 3 niveles',            'Melamina 15 mm, color blanco',                                  (select id from categories where name='Otros'),       180.00, 100.00,  0, 2);

insert into public.materials (name, type, color, thickness_mm, unit, stock, min_stock, unit_cost, supplier) values
  ('Plancha melamina Blanco 18 mm',      'plancha',     'Blanco',     18, 'plancha', 14,  6, 165.00, 'Maderas del Sur'),
  ('Plancha melamina Nogal 18 mm',       'plancha',     'Nogal',      18, 'plancha',  5,  6, 185.00, 'Maderas del Sur'),
  ('Plancha melamina Chocolate 18 mm',   'plancha',     'Chocolate',  18, 'plancha',  8,  4, 185.00, 'Maderas del Sur'),
  ('Plancha melamina Blanco 15 mm',      'plancha',     'Blanco',     15, 'plancha', 20,  8, 140.00, 'Novopan Perú'),
  ('Plancha melamina Cerezo 15 mm',      'plancha',     'Cerezo',     15, 'plancha',  3,  4, 160.00, 'Novopan Perú'),
  ('Plancha melamina Haya 18 mm',        'plancha',     'Haya',       18, 'plancha',  6,  3, 180.00, 'Novopan Perú'),
  ('Plancha MDF 3 mm (fondo)',           'plancha',     'Natural',     3, 'plancha', 10,  5,  38.00, 'Maderas del Sur'),
  ('Tapacanto Blanco 22 mm',             'tapacanto',   'Blanco',     22, 'metro',  180, 100,  0.45, 'Rehau'),
  ('Tapacanto Nogal 22 mm',              'tapacanto',   'Nogal',      22, 'metro',   40, 100,  0.55, 'Rehau'),
  ('Tapacanto Chocolate 22 mm',          'tapacanto',   'Chocolate',  22, 'metro',  120,  80,  0.55, 'Rehau'),
  ('Bisagra cangrejo 35 mm recta',       'bisagra',     null,       null, 'und',    140,  60,  1.80, 'Ferretería Lima'),
  ('Bisagra cangrejo 35 mm curva',       'bisagra',     null,       null, 'und',     32,  60,  1.90, 'Ferretería Lima'),
  ('Corredera telescópica 45 cm',        'corredera',   null,       null, 'par',     18,  12, 14.00, 'Ferretería Lima'),
  ('Corredera telescópica 35 cm',        'corredera',   null,       null, 'par',      6,  12, 11.00, 'Ferretería Lima'),
  ('Tornillo 4x50 mm (caja 200)',        'tornilleria', null,       null, 'caja',     5,   3, 22.00, 'Ferretería Lima'),
  ('Tornillo 4x16 mm (caja 500)',        'tornilleria', null,       null, 'caja',     2,   3, 18.00, 'Ferretería Lima'),
  ('Tirador barra 128 mm negro',         'otro',        'Negro',    null, 'und',     60,  30,  3.50, 'Ferretería Lima'),
  ('Tubo cromado ropero 25 mm',          'otro',        'Cromado',  null, 'metro',   12,  10, 12.00, 'Ferretería Lima');

insert into public.customers (name, phone, address) values
  ('María Quispe',   '987654321', 'Av. Los Olivos 123, Los Olivos'),
  ('Jorge Huamán',   '912345678', 'Jr. Las Begonias 456, SJL'),
  ('Rosa Ccahuana',  '956781234', 'Calle 5 Mz B Lt 12, Villa El Salvador');
