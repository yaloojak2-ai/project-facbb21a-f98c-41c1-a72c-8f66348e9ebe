CREATE TYPE public.app_role AS ENUM ('customer','barber','owner');
CREATE TYPE public.appointment_status AS ENUM ('pending','confirmed','completed','cancelled','no_show');
CREATE TYPE public.booking_source AS ENUM ('app','walk_in');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone text UNIQUE,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.salons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  address text,
  city text,
  latitude numeric,
  longitude numeric,
  image_key text DEFAULT 'salon1',
  rating numeric NOT NULL DEFAULT 4.8,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '21:00',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.salons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salons TO authenticated;
GRANT ALL ON public.salons TO service_role;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  title text,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.barbers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.barbers TO authenticated;
GRANT ALL ON public.barbers TO service_role;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '21:00',
  is_off boolean NOT NULL DEFAULT false,
  UNIQUE (barber_id, day_of_week)
);
GRANT SELECT ON public.working_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.working_hours TO authenticated;
GRANT ALL ON public.working_hours TO service_role;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name text,
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  total_price numeric NOT NULL DEFAULT 0,
  status public.appointment_status NOT NULL DEFAULT 'confirmed',
  booking_source public.booking_source NOT NULL DEFAULT 'app',
  payment_method text NOT NULL DEFAULT 'cash',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.appointment_services (
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (appointment_id, service_id)
);
GRANT SELECT, INSERT, DELETE ON public.appointment_services TO authenticated;
GRANT ALL ON public.appointment_services TO service_role;
ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

-- helpers
CREATE OR REPLACE FUNCTION public.is_salon_owner(_salon uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.salons WHERE id = _salon AND owner_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_salon_staff(_salon uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_salon_owner(_salon) OR EXISTS (SELECT 1 FROM public.barbers WHERE salon_id = _salon AND user_id = auth.uid())
$$;

-- profiles policies
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- public catalog
CREATE POLICY "Public salons" ON public.salons FOR SELECT USING (is_active OR owner_id = auth.uid());
CREATE POLICY "Create own salon" ON public.salons FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner updates salon" ON public.salons FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner deletes salon" ON public.salons FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Public barbers" ON public.barbers FOR SELECT USING (true);
CREATE POLICY "Owner manages barbers" ON public.barbers FOR ALL TO authenticated USING (public.is_salon_owner(salon_id)) WITH CHECK (public.is_salon_owner(salon_id));
CREATE POLICY "Barber toggles self" ON public.barbers FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Public services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Owner manages services" ON public.services FOR ALL TO authenticated USING (public.is_salon_owner(salon_id)) WITH CHECK (public.is_salon_owner(salon_id));

CREATE POLICY "Public hours" ON public.working_hours FOR SELECT USING (true);
CREATE POLICY "Staff manage hours" ON public.working_hours FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND (public.is_salon_owner(b.salon_id) OR b.user_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = barber_id AND (public.is_salon_owner(b.salon_id) OR b.user_id = auth.uid())));

-- appointments
CREATE POLICY "Customer reads own" ON public.appointments FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "Staff read salon" ON public.appointments FOR SELECT TO authenticated USING (public.is_salon_staff(salon_id));
CREATE POLICY "Customer books" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() AND booking_source = 'app' AND status IN ('pending','confirmed'));
CREATE POLICY "Staff add walk-in" ON public.appointments FOR INSERT TO authenticated WITH CHECK (public.is_salon_staff(salon_id));
CREATE POLICY "Customer updates own" ON public.appointments FOR UPDATE TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "Staff update salon" ON public.appointments FOR UPDATE TO authenticated USING (public.is_salon_staff(salon_id));

CREATE POLICY "Read appt services" ON public.appointment_services FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND (a.customer_id = auth.uid() OR public.is_salon_staff(a.salon_id))));
CREATE POLICY "Insert appt services" ON public.appointment_services FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id AND (a.customer_id = auth.uid() OR public.is_salon_staff(a.salon_id))));

-- customers may only change status to cancelled, not other fields
CREATE OR REPLACE FUNCTION public.guard_appointment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_salon_staff(OLD.salon_id) THEN
    IF NEW.status <> 'cancelled' OR NEW.start_time <> OLD.start_time OR NEW.end_time <> OLD.end_time
       OR NEW.barber_id <> OLD.barber_id OR NEW.total_price <> OLD.total_price THEN
      RAISE EXCEPTION 'Customers can only cancel appointments';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appt_guard BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_update();

-- overlap prevention: NewStart < ExistingEnd AND NewEnd > ExistingStart
CREATE OR REPLACE FUNCTION public.prevent_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN RAISE EXCEPTION 'Invalid time range'; END IF;
  IF NEW.status IN ('cancelled','no_show') THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.barber_id = NEW.barber_id AND a.id <> NEW.id
      AND a.status NOT IN ('cancelled','no_show')
      AND NEW.start_time < a.end_time AND NEW.end_time > a.start_time
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appt_overlap BEFORE INSERT OR UPDATE OF start_time, end_time, barber_id, status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_overlap();

-- public busy slots (no personal data)
CREATE OR REPLACE FUNCTION public.get_busy_slots(_salon uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE (barber_id uuid, start_time timestamptz, end_time timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.barber_id, a.start_time, a.end_time FROM public.appointments a
  WHERE a.salon_id = _salon AND a.status NOT IN ('cancelled','no_show')
    AND a.start_time < _to AND a.end_time > _from
$$;
GRANT EXECUTE ON FUNCTION public.get_busy_slots(uuid, timestamptz, timestamptz) TO anon, authenticated;

-- new user -> profile + customer role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- salon created -> owner role
CREATE OR REPLACE FUNCTION public.grant_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.owner_id, 'owner') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER salon_owner_role AFTER INSERT ON public.salons FOR EACH ROW EXECUTE FUNCTION public.grant_owner_role();

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- demo data
INSERT INTO public.salons (id, name, description, address, city, latitude, longitude, image_key, rating) VALUES
 ('11111111-1111-1111-1111-111111111111','صالون الملك','قصّات كلاسيكية وحلاقة بالموس الساخن','شارع عين سارة','الخليل',31.5326,35.0998,'salon1',4.9),
 ('22222222-2222-2222-2222-222222222222','بارber ستوديو','أحدث صيحات الشعر والفيد','دوار المنارة','رام الله',31.9038,35.2034,'salon2',4.7),
 ('33333333-3333-3333-3333-333333333333','ذا جنتلمان','عناية فاخرة بالشعر واللحية','شارع رفيديا','نابلس',32.2211,35.2544,'salon3',4.8);
UPDATE public.salons SET name='باربر ستوديو' WHERE id='22222222-2222-2222-2222-222222222222';

INSERT INTO public.barbers (salon_id, name, title) VALUES
 ('11111111-1111-1111-1111-111111111111','أبو أحمد','أخصائي شعر ولحية'),
 ('11111111-1111-1111-1111-111111111111','محمد','خبير الفيد'),
 ('22222222-2222-2222-2222-222222222222','يوسف','أخصائي قصّات حديثة'),
 ('22222222-2222-2222-2222-222222222222','كريم','أخصائي لحية'),
 ('33333333-3333-3333-3333-333333333333','سامي','حلاق أول'),
 ('33333333-3333-3333-3333-333333333333','خالد','أخصائي عناية بالبشرة');

INSERT INTO public.services (salon_id, name, duration_minutes, price)
SELECT s.id, v.name, v.d, v.p FROM public.salons s CROSS JOIN (VALUES
 ('قص شعر',25,35),('تحديد لحية',10,15),('حلاقة بالموس',20,25),('قص + لحية + غسيل',45,60),('صبغة شعر',40,80)
) AS v(name,d,p);