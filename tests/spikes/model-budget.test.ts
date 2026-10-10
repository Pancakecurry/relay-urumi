import {expect,it} from 'vitest';
import {estimateUSD,policy,reserve} from './model-budget.js';
it('refuses unverified credit, invalid ledgers and oversized requests before traffic',()=>{
  expect(()=>reserve({requests:0,reservedINR:0},false,200,100)).toThrow();
  expect(()=>reserve({requests:0,reservedINR:0},true,200,4097)).toThrow();
  expect(()=>reserve({requests:1,reservedINR:0},true,200,100)).toThrow();
  expect(()=>reserve({requests:0,reservedINR:0},true,201,100)).toThrow();
});
it('reserves before traffic and cannot issue a third request or exceed credit',()=>{
  const first=reserve({requests:0,reservedINR:0},true,200,4096);
  const second=reserve(first,true,200,4096);
  expect(second).toEqual({requests:2,reservedINR:100});
  expect(()=>reserve(second,true,200,100)).toThrow();
  expect(()=>reserve(first,true,75,100)).toThrow();
  // Timeout/failure does not refund the reservation; the same ledger is reused.
  expect(()=>reserve(second,true,200,100)).toThrow();
});
it('covers documented full output capacity even if thinking truncation differs',()=>{
  const worst=estimateUSD(4096,policy.documentedOutputCeiling,0)*policy.inrPerUSDGuard*policy.billingMargin;
  expect(worst).toBeLessThan(policy.reservationINR);
  expect(estimateUSD(100,20,30)).toBeCloseTo(0.000155);
  expect(()=>estimateUSD(-1,0,0)).toThrow();
});
