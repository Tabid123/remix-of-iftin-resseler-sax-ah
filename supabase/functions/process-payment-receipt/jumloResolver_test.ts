import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  expandSingleTemplate,
  resolveJumloDispatch,
} from './jumloResolver.ts';

Deno.test('expandSingleTemplate replaces {amount} and {receiver}', () => {
  const out = expandSingleTemplate('*712*{amount}*{receiver}*1234#', 50, '615555555');
  assertEquals(out, '*712*50*615555555*1234#');
});

Deno.test('multi_step provider with enabled flow → queued with trigger_code', () => {
  const provider = {
    provider_name: 'Hormuud',
    ussd_method: 'multi_step',
    ussd_flow_id: 'flow-uuid',
    ussd_single_template: null,
  };
  const flow = { trigger_code: '*725#', is_enabled: true };
  const r = resolveJumloDispatch(provider, flow, 50, '615555555');
  assertEquals(r.ussd_code, '*725#');
  assertEquals(r.delivery_status, 'queued');
  assertEquals(r.delivery_notes, null);
});

Deno.test('multi_step provider with disabled flow → failed', () => {
  const provider = {
    provider_name: 'Hormuud',
    ussd_method: 'multi_step',
    ussd_flow_id: 'flow-uuid',
    ussd_single_template: null,
  };
  const flow = { trigger_code: '*725#', is_enabled: false };
  const r = resolveJumloDispatch(provider, flow, 50, '615555555');
  assertEquals(r.ussd_code, null);
  assertEquals(r.delivery_status, 'failed');
});

Deno.test('multi_step provider with no flow row → failed', () => {
  const provider = {
    provider_name: 'Hormuud',
    ussd_method: 'multi_step',
    ussd_flow_id: null,
    ussd_single_template: null,
  };
  const r = resolveJumloDispatch(provider, null, 50, '615555555');
  assertEquals(r.ussd_code, null);
  assertEquals(r.delivery_status, 'failed');
});

Deno.test('single_step provider expands template correctly', () => {
  const provider = {
    provider_name: 'Somtel',
    ussd_method: 'single_step',
    ussd_flow_id: null,
    ussd_single_template: '*555*{amount}*{receiver}#',
  };
  const r = resolveJumloDispatch(provider, null, 100, '777888999');
  assertEquals(r.ussd_code, '*555*100*777888999#');
  assertEquals(r.delivery_status, 'queued');
});

Deno.test('single_step provider missing template → failed', () => {
  const provider = {
    provider_name: 'Somtel',
    ussd_method: 'single_step',
    ussd_flow_id: null,
    ussd_single_template: null,
  };
  const r = resolveJumloDispatch(provider, null, 100, '777888999');
  assertEquals(r.ussd_code, null);
  assertEquals(r.delivery_status, 'failed');
});

Deno.test('provider with no method but has flow_id → falls back to multi_step', () => {
  const provider = {
    provider_name: 'X',
    ussd_method: null,
    ussd_flow_id: 'flow-uuid',
    ussd_single_template: null,
  };
  const flow = { trigger_code: '*999#', is_enabled: true };
  const r = resolveJumloDispatch(provider, flow, 25, '611111111');
  assertEquals(r.ussd_code, '*999#');
  assertEquals(r.delivery_status, 'queued');
});

Deno.test('provider with nothing configured → failed', () => {
  const provider = {
    provider_name: 'X',
    ussd_method: null,
    ussd_flow_id: null,
    ussd_single_template: null,
  };
  const r = resolveJumloDispatch(provider, null, 25, '611111111');
  assertEquals(r.ussd_code, null);
  assertEquals(r.delivery_status, 'failed');
});

Deno.test('null provider → failed', () => {
  const r = resolveJumloDispatch(null, null, 10, '611111111');
  assertEquals(r.delivery_status, 'failed');
});
