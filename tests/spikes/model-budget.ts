// M0 spike only: deliberately separate from the future product provider adapter.
export const policy = Object.freeze({model:'gemini-3.5-flash-lite',maxRequests:2,maxBodyBytes:4096,maxOutputTokens:512,
  documentedOutputCeiling:65536,inputUSDPerMillion:0.30,outputUSDPerMillion:2.50,
  inrPerUSDGuard:200,billingMargin:1.5,reservationINR:50,maxReservedINR:100});
export interface Budget { requests:number; reservedINR:number; }
export function reserve(current:Budget, creditVerified:boolean, approvedINR:number, bodyBytes:number):Budget {
  if(!creditVerified||!Number.isFinite(approvedINR)||approvedINR<=0||approvedINR>200)throw new Error('Verified prepaid allowance required (maximum INR 200)');
  if(!Number.isInteger(bodyBytes)||bodyBytes<1||bodyBytes>policy.maxBodyBytes)throw new Error('Request body exceeds the M0 input boundary');
  if(!Number.isInteger(current.requests)||current.requests<0||current.requests>policy.maxRequests||current.reservedINR!==current.requests*policy.reservationINR)throw new Error('Invalid budget ledger');
  const next={requests:current.requests+1,reservedINR:current.reservedINR+policy.reservationINR};
  if(next.requests>policy.maxRequests||next.reservedINR>Math.min(approvedINR,policy.maxReservedINR))throw new Error('M0 request/reservation budget exhausted');
  return next;
}
export function estimateUSD(prompt:number, output:number, thoughts:number) {
  for(const n of [prompt,output,thoughts])if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid usage metadata');
  return (prompt*policy.inputUSDPerMillion+(output+thoughts)*policy.outputUSDPerMillion)/1e6;
}
