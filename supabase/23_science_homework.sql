-- 26 Nov 2026: science joins the daily homework (Aman in class: "char question science ke add karenge jo aap
-- log padhte ho usi se related"; one PDF, Maths heading then Science heading). A homework day's data may now
-- carry "science": [[question, answer], ...]; my_homework returns it as a separate list so the app shows two
-- headings. Days without science behave exactly as before.
create or replace function public.my_homework(p_hw_date date)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  v_student text := public.current_student_id();
  v_data jsonb; v_name text; v_rank text; v_out jsonb := '[]'::jsonb; v_sci jsonb := '[]'::jsonb; i int; v_pick jsonb;
begin
  if v_student is null then return null; end if;
  select d.data into v_data from public.homework_days d
    join public.students s on s.branch = d.branch
   where s.id = v_student and d.hw_date = p_hw_date;
  if v_data is null then return null; end if;
  v_name := v_data->'ids'->>v_student;
  if v_name is null then return null; end if;
  v_rank := v_data->'ranks'->>v_name;
  for i in 1 .. coalesce(jsonb_array_length(v_data->'common'), 0) loop
    v_pick := coalesce(v_data->'swap'->v_name->(i::text), v_data->'swap'->v_rank->(i::text), v_data->'common'->(i - 1));
    v_out := v_out || jsonb_build_array(v_pick->>0);
  end loop;
  for i in 1 .. coalesce(jsonb_array_length(v_data->'science'), 0) loop
    v_sci := v_sci || jsonb_build_array(v_data->'science'->(i - 1)->>0);
  end loop;
  return jsonb_build_object('title', v_data->>'title', 'questions', v_out, 'science', v_sci);
end $$;
