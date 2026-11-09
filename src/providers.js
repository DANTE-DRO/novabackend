import nodemailer from 'nodemailer';
export class ServiceError extends Error{constructor(message,status=503){super(message);this.status=status;}}
export function providers(env){
 const gateway=async(path,body)=>{
  if(!env.GATEWAY_URL||!env.GATEWAY_API_KEY)throw new ServiceError('Verification/payment provider is not configured. No approval or transfer has occurred.');
  const u=new URL(env.GATEWAY_URL);if(env.NODE_ENV==='production'&&u.protocol!=='https:')throw new ServiceError('Gateway requires HTTPS');
  const r=await fetch(env.GATEWAY_URL.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.GATEWAY_API_KEY,'Idempotency-Key':body.requestId||body.challengeId||''},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw new ServiceError('Provider could not complete this check. Retry later or contact support.');return r.json();
 };
 return {gateway,
  async email(to,subject,text){if(!env.SMTP_HOST||!env.SMTP_FROM)throw new ServiceError('Email service is not configured.');const t=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_SECURE==='true',auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined});await t.sendMail({from:env.SMTP_FROM,to,subject,text});},
  async grade(){throw new ServiceError('Use the backend stored-answer grader; no external AI grader is installed.');}
 };
}
