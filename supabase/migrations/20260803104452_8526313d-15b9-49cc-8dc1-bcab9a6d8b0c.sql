-- Somnet *825#: PIN is now the FIRST dialog
DO $$
DECLARE v_flow uuid := '00ba757f-cc74-4def-a45b-0f11c7d9730b';
BEGIN
  -- remove the old trailing PIN step
  DELETE FROM public.ussd_flow_steps WHERE flow_id = v_flow AND is_pin_field = true;

  -- shift remaining steps down by one (use temp offset to avoid unique clashes)
  UPDATE public.ussd_flow_steps SET step_order = step_order + 100 WHERE flow_id = v_flow;
  UPDATE public.ussd_flow_steps SET step_order = step_order - 99 WHERE flow_id = v_flow;

  -- insert PIN as step 1
  INSERT INTO public.ussd_flow_steps (flow_id, step_order, match_keywords, response_template, is_pin_field)
  VALUES (v_flow, 1,
    ARRAY['pin','furaha','sirta','password','secret','geli pin','pin-kaaga','geli furaha','enter pin'],
    '{pin}', true);
END $$;