-- 26 Nov 2026: a homework point is 100 everywhere (POINT_VALUES.homework in src/lib/storage.ts, and what a
-- teacher tap writes). The upload functions of 16/17/19/20 wrote homework = 1, so every uploaded homework
-- since 19 Nov counted 1 point on the board instead of 100. Rewrite those four functions in place and lift
-- the existing rows.
do $$
declare f text; src text;
begin
  foreach f in array array['submit_homework(date,text[])', 'submit_homework_for(text,date,text[])', 'review_homework(uuid,text,text)', 'homework_point_stays()'] loop
    begin
      src := pg_get_functiondef(f::regprocedure);
    exception when others then
      raise notice 'skip %: %', f, sqlerrm; continue;
    end;
    src := replace(src, 'homework := 1;', 'homework := 100;');
    src := replace(src, 'p_hw_date, 1)', 'p_hw_date, 100)');
    src := replace(src, 'v_row.hw_date, 1)', 'v_row.hw_date, 100)');
    src := replace(src, 'set homework = 1,', 'set homework = 100,');
    execute src;
  end loop;
end $$;

update public.daily_points set homework = 100, updated_at = now() where homework = 1;
