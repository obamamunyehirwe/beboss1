import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { AFRICASTALKING_LIVE_URL, AFRICASTALKING_SANDBOX_URL, isAfricaTalkingSmsAccepted, isValidAfricaTalkingEnvironment, isValidInternationalPhone, normalizeAfricaTalkingHookSecret } from "../_shared/africastalking.ts";
type Payload = { user?: { phone?: unknown }; sms?: { message?: unknown; otp?: unknown } };
const reply = (status:number, body:Record<string,unknown>) => new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async (req:Request) => {
 if(req.method!=="POST") return reply(405,{error:{http_code:405,message:"Method not allowed"}});
 try {
  const raw=await req.text(); if(!raw||raw.length>20000) return reply(413,{error:{http_code:413,message:"Invalid Auth SMS payload"}});
  const secrets=normalizeAfricaTalkingHookSecret(Deno.env.get("SEND_SMS_HOOK_SECRET")??"");
  if(!secrets.length) return reply(503,{error:{http_code:503,message:"Send SMS hook secret is not configured"}});
  let payload:Payload|undefined;
  for(const secret of secrets){try{payload=await new Webhook(secret).verify(raw,Object.fromEntries(req.headers.entries())) as Payload;break;}catch{continue;}}
  if(!payload) return reply(401,{error:{http_code:401,message:"Invalid Supabase Auth Hook signature"}});
  const phone=payload.user?.phone, sms=payload.sms??{};
  const otp=typeof sms.otp==="string"||typeof sms.otp==="number"?String(sms.otp).trim():"";
  const message=typeof sms.message==="string"?sms.message.trim():otp?"Your BeBoss verification code is "+otp:"";
  if(!isValidInternationalPhone(phone)||!message||message.length>1600) return reply(422,{error:{http_code:422,message:"Invalid SMS destination or message"}});
  const environment=Deno.env.get("AFRICASTALKING_ENV")??"";
  if(!isValidAfricaTalkingEnvironment(environment)) return reply(503,{error:{http_code:503,message:"AFRICASTALKING_ENV must be sandbox or production"}});
  const username=Deno.env.get("AFRICASTALKING_USERNAME")??"", apiKey=Deno.env.get("AFRICASTALKING_API_KEY")??"", sender=Deno.env.get("AFRICASTALKING_FROM")??"";
  if(!username||!apiKey||(environment==="sandbox"&&username!=="sandbox")) return reply(503,{error:{http_code:503,message:"Africa's Talking credentials are incomplete for the selected environment"}});
  const form=new URLSearchParams({username,to:phone,message}); if(sender.trim()) form.set("from",sender.trim());
  const endpoint=environment==="sandbox"?AFRICASTALKING_SANDBOX_URL:AFRICASTALKING_LIVE_URL;
  const sent=await fetch(endpoint,{method:"POST",headers:{apiKey,Accept:"application/json","Content-Type":"application/x-www-form-urlencoded"},body:form,signal:AbortSignal.timeout(5000)});
  const result=await sent.json().catch(()=>null);
  if(!sent.ok||!isAfricaTalkingSmsAccepted(result)){console.error("[send-auth-sms] provider rejected request",{status:sent.status,environment});return reply(502,{error:{http_code:502,message:"Africa's Talking did not accept the OTP request"}});}
  return reply(200,{});
 }catch(error){console.error("[send-auth-sms]",error instanceof Error?error.message:"unknown");return reply(500,{error:{http_code:500,message:"Authentication SMS delivery failed"}});}
});
