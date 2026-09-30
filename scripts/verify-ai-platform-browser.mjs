import './assert-isolated-test-environment.mjs'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const require=createRequire(import.meta.url)
const WebSocket=require(path.join(process.cwd(),'node_modules','.pnpm','ws@8.19.0','node_modules','ws'))
const chromePath=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const base=process.env.TEST_BASE_URL||'http://localhost:5000',port=9333,profile=path.resolve(process.cwd(),'.local',`qa-browser-${Date.now()}`),artifacts=path.resolve(process.cwd(),'artifacts')
if(!profile.startsWith(process.cwd()+path.sep))throw new Error('browser profile must stay inside workspace')
if(profile.startsWith(path.resolve(process.cwd(),'.local')+path.sep))await rm(profile,{recursive:true,force:true});await mkdir(profile,{recursive:true});await mkdir(artifacts,{recursive:true})
const chrome=spawn(chromePath,[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-features=Translate,OptimizationHints','--remote-allow-origins=*','--window-size=1680,1050','about:blank'],{stdio:'ignore',windowsHide:true})
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function json(url,options){const response=await fetch(url,options);if(!response.ok)throw new Error(`${url} -> ${response.status}`);return response.json()}
let version
for(let i=0;i<40;i+=1){try{version=await json(`http://127.0.0.1:${port}/json/version`);break}catch{await sleep(500)}}
if(!version)throw new Error('Chrome DevTools endpoint did not start')
const target=await json(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})
class Cdp{
  constructor(url){this.id=0;this.pending=new Map();this.events=[];this.ws=new WebSocket(url)}
  async open(){await new Promise((resolve,reject)=>{this.ws.once('open',resolve);this.ws.once('error',reject)});this.ws.on('message',data=>{const msg=JSON.parse(data.toString());if(msg.id){const p=this.pending.get(msg.id);if(!p)return;this.pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result)}else this.events.push(msg)});await this.send('Page.enable');await this.send('Runtime.enable');await this.send('Log.enable');await this.send('Network.enable')}
  send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}
  async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'browser expression failed');return result.result.value}
  async goto(url,selector,timeout=60000){await this.send('Page.navigate',{url});const end=Date.now()+timeout;while(Date.now()<end){try{if(await this.evaluate(`document.readyState==='complete'&&Boolean(document.querySelector(${JSON.stringify(selector)}))`))return}catch{}await sleep(500)}throw new Error(`selector ${selector} unavailable at ${url}`)}
  async clickText(text){return this.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(item=>(item.textContent||'').includes(${JSON.stringify(text)}));if(!b||b.disabled)return false;b.click();return true})()`)}
  async waitText(text,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){if(await this.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`))return;await sleep(700)}throw new Error(`text not observed: ${text}`)}
  async shot(name){const metrics=await this.send('Page.getLayoutMetrics'),width=Math.min(1680,Math.ceil(metrics.cssContentSize.width)),height=Math.min(3200,Math.ceil(metrics.cssContentSize.height));const image=await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});await writeFile(path.join(artifacts,name),Buffer.from(image.data,'base64'))}
}
const cdp=new Cdp(target.webSocketDebuggerUrl);const issues=[];const pages=[]
try{
  await cdp.open();await cdp.goto(`${base}/login`,'body')
  const loggedIn=await cdp.evaluate(`fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'admin',password:'123456'})}).then(r=>r.ok)`)
  if(!loggedIn)throw new Error('browser login failed')
  cdp.events=[]
  await cdp.goto(`${base}/ai-agents/workflows`,'body');await sleep(1500);pages.push({route:'/ai-agents/workflows',title:await cdp.evaluate('document.title'),textLength:await cdp.evaluate('document.body.innerText.length')});await cdp.shot('enterprise-workflow-orchestration.png')
  await cdp.goto(`${base}/ai-agents/learning`,'[data-testid="evolution-workbench"]');pages.push({route:'/ai-agents/learning',version:await cdp.evaluate(`fetch('/api/ai/evolution').then(r=>r.json()).then(j=>j.data.production.version)`)});await cdp.shot('enterprise-governed-evolution.png')
  await cdp.goto(`${base}/ai-agents/twin`,'[data-testid="digital-twin-workbench"]');const twinBefore=await cdp.evaluate(`fetch('/api/ai/twin').then(r=>r.json()).then(j=>({risk:j.data.snapshot.metrics.campusRiskScore,simulations:j.data.metrics.simulations}))`);if(!await cdp.clickText('执行真实快照推演'))throw new Error('twin simulation button unavailable');await cdp.waitText('白泽已完成可复现推演');const twinAfter=await cdp.evaluate(`fetch('/api/ai/twin').then(r=>r.json()).then(j=>({risk:j.data.latestSimulation.projected.campusRiskScore,simulations:j.data.metrics.simulations,evidence:j.data.latestSimulation.evidenceHash}))`);pages.push({route:'/ai-agents/twin',before:twinBefore,after:twinAfter});await cdp.shot('enterprise-digital-twin.png')
  await cdp.goto(`${base}/ai-agents/ecosystem`,'[data-testid="multimodal-federation-workbench"]');const fedBefore=await cdp.evaluate(`fetch('/api/ai/federation').then(r=>r.json()).then(j=>j.data.metrics.completedJobs)`);if(!await cdp.clickText('执行签名聚合'))throw new Error('federation run button unavailable');await cdp.waitText('联邦任务完成');const fedAfter=await cdp.evaluate(`fetch('/api/ai/federation').then(r=>r.json()).then(j=>({jobs:j.data.metrics.completedJobs,nodes:j.data.jobs[0].aggregate.participatingNodes,verified:j.data.jobs[0].contributions.filter(c=>c.signatureVerified).length,remoteProduction:j.data.metrics.remoteProductionNodes}))`);pages.push({route:'/ai-agents/ecosystem',beforeJobs:fedBefore,after:fedAfter});await cdp.shot('enterprise-multimodal-federation.png')
  await cdp.goto(`${base}/ai-agents/runtime`,'body');await sleep(1200);pages.push({route:'/ai-agents/runtime',textLength:await cdp.evaluate('document.body.innerText.length')})
  for(const event of cdp.events){if(event.method==='Runtime.exceptionThrown')issues.push({type:'exception',detail:event.params?.exceptionDetails?.text||'runtime exception'});if(event.method==='Log.entryAdded'&&['error','warning'].includes(event.params?.entry?.level))issues.push({type:event.params.entry.level,detail:event.params.entry.text});if(event.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(event.params?.type))issues.push({type:event.params.type,detail:(event.params.args||[]).map(arg=>arg.value||arg.description).join(' ')})}
  const filtered=issues.filter(item=>!item.detail.includes('Download the React DevTools')&&!item.detail.includes('favicon'))
  const acceptance={acceptedAt:new Date().toISOString(),browser:version.Browser,pages,twinSimulationAdvanced:(twinAfter.simulations>twinBefore.simulations),federationJobAdvanced:(fedAfter.jobs>fedBefore),warnings:filtered.filter(item=>item.type==='warning'),exceptions:filtered.filter(item=>item.type==='exception'||item.type==='error')}
  await writeFile(path.join(artifacts,'enterprise-ai-platform-acceptance.json'),JSON.stringify(acceptance,null,2),'utf8')
  if(acceptance.warnings.length||acceptance.exceptions.length)throw new Error(`browser issues: warnings=${acceptance.warnings.length} errors=${acceptance.exceptions.length}`)
  if(!acceptance.twinSimulationAdvanced||!acceptance.federationJobAdvanced||fedAfter.verified!==3)throw new Error('dynamic browser actions did not persist')
  console.log(`PASS Chrome AI platform acceptance: pages=${pages.length} twinAdvanced=true federationAdvanced=true signed=3 warnings=0 exceptions=0`)
}finally{
  try{await cdp.send('Browser.close')}catch{};try{cdp.ws.close()}catch{};await sleep(1200);if(!chrome.killed)chrome.kill();if(profile.startsWith(path.resolve(process.cwd(),'.local')+path.sep))await rm(profile,{recursive:true,force:true})
}
