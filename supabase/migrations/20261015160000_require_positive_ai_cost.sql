alter table public.cpgist_credit_settings
  drop constraint if exists cpgist_credit_settings_ai_analyst_question_cost_check;
alter table public.cpgist_credit_settings
  add constraint cpgist_credit_settings_ai_analyst_question_cost_check
  check (ai_analyst_question_cost >= 1);
