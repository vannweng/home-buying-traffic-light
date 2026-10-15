import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultOptions, parseCloseCSV, evaluateSignal, contractGuide, evaluatePosition } from '../assets/investment/options.mjs';
const now = new Date('2026-10-15T19:30:00Z');
function observation(){return {mode:'manual',current_price:97,high_price:100,high_date:'2026-10-14',quoted_at:now.toISOString()};}
test('defaults preserve NDX, 60 sessions, 3%, 90 days, 5% OTM, +100/-30',()=>{
  const o=defaultOptions();assert.deepEqual(o.settings,{symbol:'NDX',lookback:60,drawdown_percent:3,days_to_expiry:90,otm_percent:5});assert.equal(o.position.take_profit_percent,100);assert.equal(o.position.stop_loss_percent,30);
});
test('manual signal includes exact threshold; symbol and stale quote are explicit',()=>{
  const s=defaultOptions().settings;const r=evaluateSignal(s,observation(),[],now);assert.equal(r.condition_met,true);assert.equal(r.drawdown_percent,3);assert.equal(r.stale,false);assert.equal(r.source,'manual');assert.equal(r.sample_count,null);
  assert.equal(evaluateSignal({...s,symbol:'QQQ'},{...observation(),current_price:97.01},[],now).condition_met,false);
  assert.equal(evaluateSignal(s,{...observation(),high_date:'2026-10-13',quoted_at:'2026-10-14T19:30:00Z'},[],now).stale,true);
});
test('CSV sorts dates, excludes quote date, and requires enough prior closes',()=>{
  const rows=[];for(let i=0;i<120;i++){const d=new Date('2026-04-01T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);if(![0,6].includes(d.getUTCDay()))rows.push({date:d.toISOString().slice(0,10),close:100+i});}
  rows.push({date:'2026-10-15',close:999});
  const parsed=parseCloseCSV('date,close\n'+[...rows].reverse().map(r=>`${r.date},${r.close}`).join('\n'));
  const r=evaluateSignal(defaultOptions().settings,{...observation(),mode:'csv'},parsed,now);assert.equal(r.sample_count,60);assert.equal(r.high_price,219);assert.notEqual(r.high_date,'2026-10-15');
  assert.throws(()=>evaluateSignal({...defaultOptions().settings,lookback:252},{...observation(),mode:'csv'},parsed,now),/252/);
  assert.throws(()=>parseCloseCSV('date,close\n2026-10-14,10\n2026-10-14,11'),/重複/);
  assert.throws(()=>parseCloseCSV('date,close\n2026-10-10,10'),/週末/);
  assert.throws(()=>parseCloseCSV('date,close\n2026-02-30,10'),/日期/);
});
test('contract guidance is approximate, uses calendar days and QQQ price',()=>{
  const g=contractGuide(500,90,5,now);assert.equal(g.reference_strike,525);assert.equal(g.reference_expiration,'2027-01-13');assert.throws(()=>contractGuide('',90,5,now),/輸入/);
});
function position(){return {contracts:2,buy_premium:5,current_premium:10,strike:525,expiration:'2027-01-15',quoted_at:now.toISOString(),take_profit_percent:100,stop_loss_percent:30};}
test('premium-based take profit, cost multiplier and integer contract handling',()=>{
  const r=evaluatePosition(position(),now);assert.equal(r.pnl_percent,100);assert.equal(r.take_profit_met,true);assert.equal(r.take_profit_contracts,1);assert.equal(r.cost_usd,1000);assert.equal(r.unrealized_pnl_usd,1000);assert.equal(r.break_even_at_expiry,530);
  assert.equal(evaluatePosition({...position(),contracts:1},now).take_profit_contracts,0);assert.equal(evaluatePosition({...position(),contracts:3},now).exactly_half,false);
});
test('stop boundary, total premium loss, expiration and invalid position are handled',()=>{
  const r=evaluatePosition({...position(),current_premium:3.5},now);assert.equal(r.stop_loss_met,true);assert.equal(r.pnl_percent,-30);
  assert.equal(evaluatePosition({...position(),current_premium:0},now).pnl_percent,-100);
  assert.equal(evaluatePosition({...position(),expiration:'2026-10-14'},now).expired,true);
  assert.throws(()=>evaluatePosition({...position(),contracts:1.5},now),/整數/);
  assert.throws(()=>evaluatePosition({...position(),buy_premium:0},now),/大於/);
  assert.throws(()=>evaluatePosition({...position(),buy_premium:1e308},now),/範圍/);
});
