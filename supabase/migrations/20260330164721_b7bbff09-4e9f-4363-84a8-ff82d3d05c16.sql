
ALTER TABLE public.clock_entries
  DROP CONSTRAINT clock_entries_clock_location_id_fkey,
  ADD CONSTRAINT clock_entries_clock_location_id_fkey
    FOREIGN KEY (clock_location_id) REFERENCES public.clock_locations(id)
    ON DELETE SET NULL;
