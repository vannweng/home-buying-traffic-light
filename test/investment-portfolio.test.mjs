import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPortfolio, portfolioInput, previewRebalance, previewContribution, simulatePortfolio } from '../assets/investment/portfolio.mjs';

function input(invest = 700000, cash = 300000) {
  const p = defaultPortfolio(); p.cash.current_value = cash;
  p.assets.forEach(a => a.current_value = invest * a.target_ratio);
  return portfolioInput(p);
}
const cents = n => Math.round(n * 100);
function simulation(overrides = {}) {
  const p = defaultPortfolio();
  return { initial_portfolio_value: 1000000, ...p.settings, assets: p.assets, cash_annual_return: 0, simulation: { method: 'deterministic_monthly', return_conversion: 'effective_monthly', contribution_timing: 'end_of_month', rebalance_mode: 'threshold', rebalance_threshold: .05 }, ...overrides };
}
test('A-5 A through D: exact targets and actual trigger are separate', () => {
  for (const [invest, cash, triggered, delta] of [[700000,300000,false,0],[600000,300000,false,30000],[800000,300000,false,-30000],[400000,300000,true,90000]]) {
    const r = previewRebalance(input(invest,cash));
    assert.equal(r.should_rebalance,triggered); assert.equal(r.potential_trade_to_exact_target,delta);
    assert.equal(r.suggested_total_trade,triggered ? delta : 0);
    assert.equal(r.suggested_trades.length,triggered ? 3 : 0);
    const net = r.potential_trades.reduce((n,t) => n + (t.action === 'SELL' ? -cents(t.amount) : cents(t.amount)),0);
    assert.equal(net,cents(delta)); assert.equal(cents(r.target_invest_value+r.target_cash_value),cents(r.total_value));
  }
  assert.deepEqual(previewRebalance(input(600000)).potential_trades.map(t=>t.amount),[15000,9000,6000]);
});
test('A-5 E: contribution produces 707000 investment and 303000 cash without imaginary profit',()=>{
  const r=previewContribution(input(),10000);
  assert.equal(r.after_contribution.current_invest_value,707000);assert.equal(r.after_contribution.current_cash_value,303000);
  assert.deepEqual(r.contribution_trades.map(t=>t.amount),[3500,2100,1400]);assert.equal(r.cash_retained,3000);
});
test('threshold is strictly greater, with exact cent boundary comparisons',()=>{
  assert.equal(previewRebalance(input(650000,350000)).should_rebalance,false);
  const p=input();p.assets.forEach(a=>a.current_value=0);p.assets[0].current_value=649999.99;p.cash_value=350000.01;
  assert.equal(previewRebalance(p).should_rebalance,true);
  assert.equal(previewRebalance(input(750000,250000)).should_rebalance,false);
});
test('internal asset drift does not independently trigger; preview can contain offsetting trades',()=>{
  const p=input();p.assets[0].current_value=200000;p.assets[1].current_value=360000;
  const r=previewRebalance(p);assert.equal(r.should_rebalance,false);assert.equal(r.potential_trade_to_exact_target,0);
  assert.equal(r.gross_buy,150000);assert.equal(r.gross_sell,150000);
});
test('contribution favors shortfalls, never sells, and retains new cash if investment is overweight',()=>{
  const below=previewContribution(input(400000),10000);assert.equal(below.cash_retained,0);assert.equal(below.after_contribution.current_invest_value,410000);assert.equal(below.after_contribution.potential_trade_to_exact_target,87000);
  const above=previewContribution(input(800000),10000);assert.equal(above.cash_retained,10000);assert.ok(above.contribution_trades.every(t=>t.amount===0));
});
test('cent allocation conserves money even for awkward weights and tiny amounts',()=>{
  const p=input();p.assets.forEach((a,i)=>{a.target_ratio=[.333333333,.333333333,.333333334][i];a.current_value=.01;});p.cash_value=.02;
  const r=previewRebalance(p);assert.equal(cents(r.total_value),5);assert.equal(r.potential_trades.reduce((n,t)=>n+cents(t.target_value),0),cents(r.target_invest_value));
  const c=previewContribution(p,.01);assert.equal(cents(c.after_contribution.total_value),6);
});
test('validation rejects bad sums, duplicate symbols, negative money, excess precision and zero total',()=>{
  const p=input();assert.throws(()=>previewRebalance({...p,target_cash_ratio:.2}),/100%/);
  assert.throws(()=>previewRebalance({...p,assets:p.assets.map(a=>({...a,target_ratio:.2}))}),/100%/);
  assert.throws(()=>previewRebalance({...p,assets:p.assets.map(a=>({...a,symbol:'VOO'}))}),/重複/);
  assert.throws(()=>previewRebalance({...p,cash_value:-1}),/非負/);
  assert.throws(()=>previewRebalance({...p,cash_value:.001}),/小數/);
  assert.throws(()=>previewRebalance({...p,cash_value:1e13}),/範圍/);
  assert.throws(()=>previewRebalance({...p,cash_value:0,assets:p.assets.map(a=>({...a,current_value:0}))}),/大於零/);
  const source=defaultPortfolio();source.settings.auto_execute=true;assert.throws(()=>portfolioInput(source),/false/);
});
test('simulation has month 0 to 120, excludes contributions from profit and conserves every row',()=>{
  const r=simulatePortfolio(simulation());assert.equal(r.monthly_results.length,121);assert.equal(r.summary.total_contributions,1200000);assert.equal(r.summary.total_principal,2200000);
  assert.equal(r.summary.projected_final_value-r.summary.projected_profit,2200000);
  for(const row of r.monthly_results){assert.equal(cents(row.total_value),cents(row.invest_value)+cents(row.cash_value));assert.equal(cents(row.total_value),cents(row.total_principal)+cents(row.investment_profit));assert.equal(row.cumulative_contributions,row.month*10000);assert.equal(row.assets.reduce((n,a)=>n+cents(a.current_value),0),cents(row.invest_value));}
  assert.equal(r.monthly_results[0].invest_value,700000);assert.equal(r.monthly_results[0].cash_value,300000);
});
test('trading currency accepts stablecoin codes without changing the TWD valuation',()=>{
  const p=defaultPortfolio();
  for(const code of ['TWD','USD','USDT','USDC','JPY','MYR']){
    p.assets[0].currency=code;const value=portfolioInput(p);assert.equal(value.assets[0].currency,code);assert.equal(previewRebalance(value).total_value,1000000);
  }
  for(const code of ['usd','US$','TOOLONG',null,123]){p.assets[0].currency=code;assert.throws(()=>portfolioInput(p),/幣別/);}
});
test('zero-return simulation has no profit even with contributions and rebalancing',()=>{
  const s=simulation();s.assets.forEach(a=>a.expected_annual_return=0);
  const r=simulatePortfolio(s);assert.equal(r.summary.projected_final_value,2200000);assert.equal(r.summary.projected_profit,0);assert.equal(r.monthly_results.filter(r=>r.rebalance_executed).length,0);
});
test('effective monthly compounding and end-of-month contributions match hand calculation',()=>{
  const s=simulation({initial_portfolio_value:100000,monthly_contribution:1000,simulation_years:1,target_invest_ratio:1,target_cash_ratio:0,assets:[{symbol:'X',target_ratio:1,expected_annual_return:.12}]});
  const r=simulatePortfolio(s), m=1.12**(1/12); const expected=100000*1.12+1000*(m**12-1)/(m-1);
  assert.ok(Math.abs(r.summary.projected_final_value-expected)<.1);
  assert.ok(Math.abs(r.monthly_results[1].total_value-(100000*m+1000))<.01);
});
test('negative return and cash-only scenarios work; unsupported modes and overflowing models fail',()=>{
  const s=simulation({simulation_years:1});s.assets.forEach(a=>a.expected_annual_return=-.2);assert.ok(simulatePortfolio(s).summary.projected_profit<0);
  assert.equal(simulatePortfolio(simulation({target_invest_ratio:0,target_cash_ratio:1})).summary.projected_profit,0);
  assert.throws(()=>simulatePortfolio(simulation({simulation:{}})),/模擬需/);
  assert.throws(()=>simulatePortfolio(simulation({simulation_years:0})),/年數/);
  const huge=simulation({simulation_years:50});huge.assets.forEach(a=>a.expected_annual_return=10);assert.throws(()=>simulatePortfolio(huge),/範圍/);
});
test('a total-loss scenario can reach zero without NaN or creating cash; functions leave inputs untouched',()=>{
  const s=simulation({target_invest_ratio:1,target_cash_ratio:0,monthly_contribution:0,simulation_years:1});s.assets.forEach(a=>a.expected_annual_return=-1);
  const original=JSON.stringify(s),r=simulatePortfolio(s);assert.equal(JSON.stringify(s),original);assert.equal(r.summary.projected_final_value,0);assert.equal(r.summary.projected_profit,-1000000);assert.equal(r.monthly_results[1].cash_ratio,null);assert.ok(r.monthly_results.slice(1).every(row=>row.total_value===0));
  const p=input(),before=JSON.stringify(p);previewRebalance(p);previewContribution(p,10000);assert.equal(JSON.stringify(p),before);
});
