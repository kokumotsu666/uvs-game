const {chromium}=require('playwright');const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true}),page=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.resolve(__dirname,'../../index.html'));
 await page.selectOption('#d1','柳生・射撃');await page.selectOption('#d2','葛城・削り');await page.selectOption('#first','0');await page.selectOption('#delay','400');await page.uncheck('#autocopy');await page.click('#start');
 await page.locator('#actions button').last().click();await page.waitForFunction(()=>G.turn>=2&&G.prompt?.pi===0,{},{timeout:30000});
 assert(await page.evaluate(()=>CPU_RESOURCES.profile(P[0]).shared));await page.click('#btnlog');await page.locator('#copylog').waitFor();assert((await page.locator('#overlay .log').innerText()).includes('ゲーム開始'));
 assert.equal(errors.length,0);fs.writeFileSync(path.join(__dirname,'browser-validation.json'),JSON.stringify({pageErrors:errors,viewport:'390x844',localCandidate:true,started:true,cpuTurnObserved:true,logVisible:true,realIPhone:false},null,2)+'\n');
 await b.close();console.log('PASS local 390x844 browser start/CPU turn/log, no page errors');
})().catch(e=>{console.error(e);process.exitCode=1});
