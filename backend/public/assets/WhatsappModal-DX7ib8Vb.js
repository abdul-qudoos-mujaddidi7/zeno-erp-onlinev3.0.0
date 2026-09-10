import{s as at,p as _e,l as _,A as i,j as rt,m as lt,N as pt,G as H,$ as ct,n as ut,P as Se,e as me,av as De,q as _t,v as de,u as mt,J as m,K as c,x as N,H as h,I as j,B as w,D as Fe,S as Y,F as Z,E as dt,a0 as We,g as Le}from"./vendor-B2JKt1Tj.js";import{l as ft,a as ht,g as bt,r as G,t as r,v as oe}from"./index-CrgSFOVp.js";/* empty css                                                    */var vt=Le('<button type="button" class="wa-btn wa-btn--primary svelte-hvyfsn"><i class="bi bi-whatsapp" aria-hidden="true"></i> </button>'),yt=Le('<div class="wa-overlay svelte-hvyfsn" role="presentation"><div class="wa-panel svelte-hvyfsn" role="dialog" aria-modal="true" aria-labelledby="wa-modal-title"><header class="wa-header svelte-hvyfsn"><div class="wa-header-main svelte-hvyfsn"><span class="wa-icon svelte-hvyfsn" aria-hidden="true"><i class="bi bi-whatsapp"></i></span> <h2 id="wa-modal-title" class="wa-title svelte-hvyfsn"> </h2></div> <button type="button" class="wa-close svelte-hvyfsn"><i class="bi bi-x-lg"></i></button></header> <div class="wa-body svelte-hvyfsn"><div class="wa-field svelte-hvyfsn"><label class="wa-label svelte-hvyfsn" for="wa-phone"> </label> <div class="wa-phone-row svelte-hvyfsn"><input id="wa-phone" type="text" class="wa-input svelte-hvyfsn" dir="ltr"/> <button type="button"><i class="bi bi-pencil"></i></button></div></div> <div class="wa-field svelte-hvyfsn"><label class="wa-label svelte-hvyfsn" for="wa-message"> </label> <textarea id="wa-message" class="wa-textarea svelte-hvyfsn" rows="8"></textarea></div></div> <footer class="wa-footer svelte-hvyfsn"><button type="button" class="wa-btn wa-btn--secondary svelte-hvyfsn"> </button> <!></footer></div></div>');function xt(Me,O){at(O,!1);const fe=()=>de(ft,"$lang",ie),he=()=>de(ht,"$translate_org_type",ie),s=()=>de(bt,"$settings_all",ie),[ie,Pe]=mt(),Ce=m(),Oe=m(),K=m(),be=m(),ve=m(),se=m(),ye=m(),je=m(),we=m(),ge=m(),ae=m(),J=m(),xe=m(),$e=m(),L=m(),U=m(),I=m(),R=m(),q=m(),ee=`مشتری گرامی {{اسم مشتری}}،

✅ حساب شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📊 از این پس تمامی معاملات و گزارش‌های شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از اعتماد شما سپاسگزاریم.`,Ae=`تأمین‌کننده گرامی {{اسم مشتری}}،

✅ حساب تأمین‌کننده شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📦 از این پس تمامی خریدها، پرداخت‌ها، بدهی‌ها و گزارش‌های حساب شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از همکاری شما سپاسگزاریم.`,Ne=`🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

بل فروش
🔢 شماره بل: {{شماره بل}}

محترم {{اسم حساب}}،

🛒 محصولات:
{{محصولات}}

💰 مجموع بل: {{مجموع بل}}
🎁 تخفیف: {{تخفیف}}
💸 مصارف: {{مصارف}}
✅ مبلغ قابل پرداخت: {{رسید بل}}

🟥 بیلانس قبلی: {{بیلانس قبلی}}
⚖️ بیلانس فعلی: {{بیلانس}}

💬 توضیحات: {{توضیحات}}

🙏 از خرید و اعتماد شما سپاسگزاریم.`,re=`🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

💱 نرخ تبادله ارز
🔢 شماره تبادله: {{شماره تبادله}}

از ارز: {{ارز اول}}
به ارز: {{ارز دوم}}
📈 نرخ: {{نرخ}}

👤 حساب: {{اسم حساب}}
👥 حساب همتا: {{حساب همتا}}
💰 مقدار اول: {{مقدار اول}}
💰 مقدار دوم: {{مقدار دوم}}

📝 توضیحات: {{توضیحات}}`;let te=_e(O,"showWhatsappModal",12,!1),g=_e(O,"message",12,""),b=_e(O,"phone",12,""),M=m(!0);const Ue="\n\n`تهیه شده توسط زینو ای آر پی`";let ne=["جنوری","فبروری","مارچ","اپریل","می","جون","جولای","اگست","سپتمبر","اکتوبر","نومبر","دسمبر"];function X(e=""){return e.startsWith("07")?"+93"+e.slice(1):e}function Ie(e=""){const o=r("dir")==="rtl"?"‏":"‎";return String(e??"").split(`
`).map(t=>{if(!t)return t;const a=t.replace(/^[\u200E\u200F]+/,"");return`${o}${a}`}).join(`
`)}function Re(){return encodeURIComponent(Ie(g()+Ue))}function qe(){return`whatsapp://send?phone=${String(b()||"").replace(/\D/g,"")}&text=${Re()}`}function ze(){return"https://www.whatsapp.com/download"}function Ve(e){e.preventDefault();const o=qe(),t=ze(),a=window.open("about:blank","_blank");if(!a){window.alert("Please allow pop-ups for this website, then try again.");return}try{a.opener=null,a.document.title="Opening WhatsApp",a.document.body.innerHTML=`
        <div style="
          min-height:100vh;
          display:grid;
          place-items:center;
          margin:0;
          padding:24px;
          box-sizing:border-box;
          background:#f8fafc;
          color:#334155;
          font-family:Arial,sans-serif;
          text-align:center;
        ">
          <div>
            <div style="font-size:18px;font-weight:700;margin-bottom:8px;">
              Opening WhatsApp…
            </div>
            <div style="font-size:14px;color:#64748b;">
              If WhatsApp is not installed, the download page will open.
            </div>
          </div>
        </div>
      `}catch(l){console.warn("Could not prepare WhatsApp tab:",l)}try{a.location.href=o}catch(l){console.warn("Could not open WhatsApp protocol:",l)}window.setTimeout(()=>{try{a&&!a.closed&&a.location.replace(t)}catch{try{a&&!a.closed&&(a.location.href=t)}catch(S){console.warn("Could not open the WhatsApp download page:",S)}}},1800)}function Be(e={}){return Object.entries(e).sort(([o],[t])=>{const a={AFN:0,USD:1};return(a[o]??99)-(a[t]??99)}).map(([o,t])=>{const a=Number(typeof t=="object"?t.balance||0:t||0),l=a>=0?"طلبکار":"باقیدار";return`‎${Math.abs(a).toLocaleString(void 0,{maximumFractionDigits:3})} ${r(o)} ${l}`}).join(`
`)}function ke(e="",o="",t={},a={}){const l=new Date().toISOString().slice(0,10),S=`
${Be(a)}`;return e.split("{{نام شرکت}}").join(i(L)).split("{{تاریخ}}").join(l).split("{{شماره حساب}}").join(oe(o||t.id)).split("{{اسم مشتری}}").join(t.name||"").split("{{اسم تأمین‌کننده}}").join(t.name||"").split("{{اسم تامین‌کننده}}").join(t.name||"").split("{{اسم عرضه‌کننده}}").join(t.name||"").split("{{اسم حساب}}").join(t.name||"").split("{{نوع حساب}}").join(t.account_type_label||"").split("{{بیلانس}}").join(S).split("{{نوت}}").join(t.description||"").split("{{توضیحات}}").join(t.description||"").split("{{ایمیل شرکت}}").join(i(q)).split("{{شماره شرکت}}").join(i(U)).split("{{شماره۲ شرکت}}").join(i(I)).split("{{آدرس شرکت}}").join(i(R))}function z(e={}){return e?r("Lang")==="fa"?e.name_fa||e.name||e.name_ps||"":r("Lang")==="ps"?e.name_ps||e.name_fa||e.name||"":e.name||e.name_fa||e.name_ps||"":""}function He(e,o){const t=Number(e||0).toLocaleString(void 0,{maximumFractionDigits:3});return o?`${t} ${r(o)}`:t}function Ge(e={}){return Object.entries(e||{}).map(([o,t])=>`${Number(typeof t=="object"?t?.balance||0:t||0).toLocaleString(void 0,{maximumFractionDigits:3})} ${r(o)}`).join(" | ")}function y(e,o){const t=Number(e||0).toLocaleString(void 0,{maximumFractionDigits:3});return o?`${t} ${r(o)}`:t}function Ke(e={}){const o=[e.expense_amount,e.expenses_amount,e.total_expenses,e.additional_expenses,e.shipping_cost,e.delivery_cost,e.service_charge];for(const a of o){const l=Number(a);if(Number.isFinite(l))return l}if(Array.isArray(e.expenses))return e.expenses.reduce((a,l)=>a+Number(l?.amount??l?.expense_amount??l?.value??0),0);const t=Number(e.expenses||0);return Number.isFinite(t)?t:0}function Te(e="account_created_template",o="",t={},a={},l={},S="",le=null){if(g(""),b(""),c(M,!0),e=="patient_created_template")g(i(ye).split("{{نام شرکت}}").join(i(L)).split("{{کد مریض}}").join(t.code).split("{{اسم مریض}}").join(t.name).split("{{ایمیل شرکت}}").join(i(q)).split("{{شماره شرکت}}").join(i(U)).split("{{شماره۲ شرکت}}").join(i(I)).split("{{آدرس شرکت}}").join(i(R))),t.phone&&b(t.phone.startsWith("07")?"+93"+t.phone.slice(1):t.phone);else if(e=="account_whatsapp_welcome_template"||e=="supplier_account_whatsapp_welcome_template"||e=="account_whatsapp_balance_template"||e=="account_whatsapp_note_template"){const d={account_whatsapp_welcome_template:i(J),supplier_account_whatsapp_welcome_template:i(se),account_whatsapp_balance_template:i(xe),account_whatsapp_note_template:i($e)}[e]||i(J)||ee;g(ke(d,o,t,a)),b(t?.phone?X(t.phone):"")}else if(e=="account_created_template"||e=="customer_account_created_template"||e=="supplier_account_created_template"){const n={account_created_template:i(J)||i(K),customer_account_created_template:i(J)||i(be),supplier_account_created_template:i(se)||i(ve)};g(ke(n[e]||i(K),o,t,a)),b(t?.phone?X(t.phone):"")}else if(e=="journal_created_template"){const n=String(o?.date||""),d=n?G(n,"forPDF"):["","",""],x=n?`${d[0]} ${d[1]} ${d[2]} مطابق ${n.slice(8,10)} ${ne[parseInt(n.slice(5,7),10)-1]||""} ${n.slice(0,4)}`:"",f=Number(o?.first_entry_debit||0),k=Number(o?.first_entry_credit||0),u=He(f!==0?f:k,o?.currency),$=`${f!==0?r("Debit"):r("Credit")}: ${u}`,T=le?.invoice_number||o?.invoice_number||o?.bill_number||"-",D=z(l)||"-",A=z(t)||"-",P=Ge(a);g(String(i(je)||"").split("{{نام شرکت}}").join(i(L)).split("{{تاریخ}}").join(x).split("{{مرجع}}").join(S||"").split("{{اسم حساب}}").join(A).split("{{اسم مشتری}}").join(A).split("{{شماره حساب}}").join(oe(t?.id||0)).split("{{حساب همتا}}").join(D).split("{{نام حساب همتا}}").join(D).split("{{مقدار پول}}").join($).split("{{مقدار}}").join(u).split("{{مبلغ}}").join(u).split("{{شماره بل}}").join(T).split("{{شماره فاکتور}}").join(T).split("{{بل}}").join(T).split("{{بیلانس}}").join(P).split("{{توضیحات}}").join(o?.description?`توضیحات: ${o.description}`:"").split("{{ایمیل شرکت}}").join(i(q)).split("{{شماره شرکت}}").join(i(U)).split("{{شماره۲ شرکت}}").join(i(I)).split("{{آدرس شرکت}}").join(i(R))),b(t?.phone?X(t.phone):"")}else if(e=="appointment_created_template")g(i(we).split("{{نام شرکت}}").join(i(L)).split("{{تاریخ}}").join(G(o.date,"forPDF")[0]+" "+G(o.date,"forPDF")[1]+" "+G(o.date,"forPDF")[2]+" مطابق "+o.date.slice(8,10)+" "+ne[parseInt(o.date.slice(5,7))-1]+" "+o.date.slice(0,4)).split("{{دیپارتمنت}}").join(S).split("{{اسم مریض}}").join(t.name).split("{{داکتر}}").join(l.first_name+" "+l.last_name).split("{{کد مریض}}").join(t.code).split("{{مقدار پول}}").join(r("Appointment Fee")+": "+Number(o.fee||0).toLocaleString(void 0,{maximumFractionDigits:3})+" "+r(o.currency)).split("{{شماره نوبت}}").join(o.serial_no).split("{{توضیحات}}").join(o.description?"توضیحات: "+o.description:"")),t.phone&&b(t.phone.startsWith("07")?"+93"+t.phone.slice(1):t.phone);else if(e=="sale_created_template"){const n=o||{},d=Array.isArray(n.items)?n.items:[],x=d.map((p,v)=>{const F=Number(p?.quantity||0).toLocaleString(void 0,{maximumFractionDigits:3}),Q=y(p?.unit_price??p?.calculated_price??0,p?.currency||n.currency),E=y(p?.subtotal??Number(p?.quantity||0)*Number(p?.unit_price??p?.calculated_price??0),p?.currency||n.currency),W=p?.unit_name||p?.product_unit_name||"";return`‏${v+1}. ${p?.product_name||"-"} — ${F}${W?` ${W}`:""} — ${Q} — ${E}`}).join(`
`),f=String(n.invoice_date||n.date||""),k=f?G(f,"forPDF"):["","",""],B=f?`${k[0]} ${k[1]} ${k[2]} مطابق ${f.slice(8,10)} ${ne[parseInt(f.slice(5,7),10)-1]||""} ${f.slice(0,4)}`:"",u=n.currency||"AFN",$=Number(n.bill_subtotal??d.reduce((p,v)=>p+Number(v?.subtotal||0),0)),T=Number(n.discount_amount??n.discount??0),D=Ke(n),A=Number(n.payable_amount??n.total_amount??$-T+D),P=Number(n.paid??n.received_amount??0),C=Object.entries(a||{}).map(([p,v])=>{const F=Number(typeof v=="object"?v?.balance||0:v||0),Q=Number(n.due??A-P),E=p===u?F+Q:F;return y(E,p)}).join(" | "),pe=Object.entries(a||{}).map(([p,v])=>{const F=Number(typeof v=="object"?v?.balance||0:v||0);return y(F,p)}).join(" | ");g(String(i(ge)||Ne).split("{{نام شرکت}}").join(i(L)).split("{{تاریخ}}").join(B).split("{{اسم حساب}}").join(z(t)||"-").split("{{اسم مشتری}}").join(z(t)||"-").split("{{شماره حساب}}").join(oe(t?.id||0)).split("{{شماره بل}}").join(n.invoice_number||"-").split("{{شماره فاکتور}}").join(n.invoice_number||"-").split("{{محصولات}}").join(x||"-").split("{{مجموع بل}}").join(y($,u)).split("{{تخفیف}}").join(y(T,u)).split("{{مصارف}}").join(y(D,u)).split("{{هزینه}}").join(y(D,u)).split("{{رسید بل}}").join(y(A,u)).split("{{مبلغ قابل پرداخت}}").join(y(A,u)).split("{{مبلغ پرداخت شده}}").join(y(P,u)).split("{{باقی مانده}}").join(y(A-P,u)).split("{{بیلانس قبلی}}").join(C||"-").split("{{بیلانس}}").join(pe||"-").split("{{توضیحات}}").join(n.description||"").split("{{ایمیل شرکت}}").join(i(q)).split("{{شماره شرکت}}").join(i(U)).split("{{شماره۲ شرکت}}").join(i(I)).split("{{آدرس شرکت}}").join(i(R))),b(t?.phone?X(t.phone):"")}else if(e=="exchange_created_template"){const n=o||{},d=String(n.date||""),x=d?G(d.slice(0,10),"forPDF"):["","",""],f=d?`${x[0]} ${x[1]} ${x[2]} مطابق ${d.slice(8,10)} ${ne[parseInt(d.slice(5,7),10)-1]||""} ${d.slice(0,4)}`:"",k=z(t)||"-",B=z(l)||"-",u=Number(n.first_entry_debit||n.first_entry_credit||0).toLocaleString(void 0,{maximumFractionDigits:3}),$=Number(n.second_entry_debit||n.second_entry_credit||0).toLocaleString(void 0,{maximumFractionDigits:3});g(String(i(ae)||re).split("{{نام شرکت}}").join(i(L)).split("{{تاریخ}}").join(f).split("{{شماره تبادله}}").join(oe(n.id||"-")).split("{{ارز اول}}").join(r(n.first_currency)||n.first_currency||"-").split("{{ارز دوم}}").join(r(n.second_currency)||n.second_currency||"-").split("{{نرخ}}").join(Number(n.rate||0).toLocaleString(void 0,{maximumFractionDigits:6})).split("{{اسم حساب}}").join(k).split("{{حساب همتا}}").join(B).split("{{مقدار اول}}").join(`${u} ${r(n.first_currency)||n.first_currency||""}`).split("{{مقدار دوم}}").join(`${$} ${r(n.second_currency)||n.second_currency||""}`).split("{{توضیحات}}").join(n.description||"").split("{{ایمیل شرکت}}").join(i(q)).split("{{شماره شرکت}}").join(i(U)).split("{{شماره۲ شرکت}}").join(i(I)).split("{{آدرس شرکت}}").join(i(R))),b(t?.phone?X(t.phone):"")}c(M,!0),te(!0),setTimeout(()=>{window.mdb&&(document.querySelectorAll("[data-mdb-input-init]").forEach(n=>new window.mdb.Input(n)),document.querySelectorAll(".dropdown-toggle").forEach(n=>{new window.mdb.Dropdown(n)}))},100)}function V(){te(!1)}function Je(e){e.target===e.currentTarget&&V()}function Xe(e){e.key==="Escape"&&te()&&V()}_(()=>fe(),()=>{c(Ce,fe())}),_(()=>he(),()=>{c(Oe,he())}),_(()=>s(),()=>{c(K,s().find(e=>e.key==="account_created_template")?.value||ee)}),_(()=>s(),()=>{c(be,s().find(e=>e.key==="customer_account_created_template")?.value||s().find(e=>e.key==="account_customer_created_template")?.value||ee)}),_(()=>s(),()=>{c(ve,s().find(e=>e.key==="supplier_account_created_template")?.value||s().find(e=>e.key==="account_supplier_created_template")?.value||Ae)}),_(()=>s(),()=>{c(se,s().find(e=>e.key==="supplier_account_whatsapp_welcome_template")?.value||s().find(e=>e.key==="supplier_account_created_template")?.value||Ae)}),_(()=>s(),()=>{c(ye,s().find(e=>e.key==="patient_created_template")?.value||"")}),_(()=>s(),()=>{c(je,s().find(e=>e.key==="journal_created_template")?.value||"")}),_(()=>s(),()=>{c(we,s().find(e=>e.key==="appointment_created_template")?.value||"")}),_(()=>s(),()=>{c(ge,s().find(e=>e.key==="sale_created_template")?.value||Ne)}),_(()=>s(),()=>{c(ae,s().find(e=>e.key==="exchange_created_template")?.value||re)}),_(()=>s(),()=>{c(ae,s().find(e=>e.key==="exchange_created_template")?.value||re)}),_(()=>(s(),i(K)),()=>{c(J,s().find(e=>e.key==="account_whatsapp_welcome_template")?.value||i(K)||ee)}),_(()=>s(),()=>{c(xe,s().find(e=>e.key==="account_whatsapp_balance_template")?.value||"")}),_(()=>s(),()=>{c($e,s().find(e=>e.key==="account_whatsapp_note_template")?.value||"")}),_(()=>s(),()=>{c(L,s().find(e=>e.key==="company_name")?.value||"")}),_(()=>s(),()=>{c(U,s().find(e=>e.key==="company_phone")?.value||"")}),_(()=>s(),()=>{c(I,s().find(e=>e.key==="company_phone2")?.value||"")}),_(()=>s(),()=>{c(R,s().find(e=>e.key==="company_address")?.value||"")}),_(()=>s(),()=>{c(q,s().find(e=>e.key==="company_email")?.value||"")}),rt();var Qe={openModal:Te,closeModal:V};lt();var Ee=pt();H("keydown",ct,Xe);var Ye=ut(Ee);{var Ze=e=>{var o=yt(),t=h(o),a=h(t),l=h(a),S=N(h(l),2),le=h(S),n=N(l,2),d=N(a,2),x=h(d),f=h(x),k=h(f),B=N(f,2),u=h(B),$=N(u,2);let T;var D=N(x,2),A=h(D),P=h(A),C=N(A,2),pe=N(d,2),p=h(pe),v=h(p),F=N(p,2);{var Q=E=>{var W=vt(),ce=N(h(W));Fe(ue=>Z(ce,` ${ue??""}`),[()=>(j(r),w(()=>r("Send to Whatsapp")))]),H("click",W,Ve),me(E,W)};Se(F,E=>{j(b()),w(()=>b()&&b().length>=10)&&E(Q)})}Fe((E,W,ce,ue,tt,nt,ot,it,st)=>{Y(o,"dir",E),Y(t,"dir",W),Z(le,ce),Y(n,"aria-label",ue),Z(k,tt),u.readOnly=i(M),u.dir=u.dir,T=dt($,1,"wa-edit svelte-hvyfsn",null,T,{active:!i(M)}),Y($,"aria-label",nt),Z(P,ot),Y(C,"dir",it),C.readOnly=i(M),C.dir=C.dir,Z(v,st),t.dir=t.dir,o.dir=o.dir},[()=>(j(r),w(()=>r("dir"))),()=>(j(r),w(()=>r("dir"))),()=>(j(r),w(()=>r("Send Whatsapp Message"))),()=>(j(r),w(()=>r("Close"))),()=>(j(r),w(()=>r("Whatsapp Number"))),()=>(j(r),w(()=>r("Edit"))),()=>(j(r),w(()=>r("Message"))),()=>(j(r),w(()=>r("dir"))),()=>(j(r),w(()=>r("Close")))]),H("click",n,V),We(u,b),H("click",$,()=>{c(M,!i(M))}),We(C,g),H("click",p,V),H("click",o,Je),me(e,o)};Se(Ye,e=>{te()&&e(Ze)})}me(Me,Ee),De(O,"openModal",Te),De(O,"closeModal",V);var et=_t(Qe);return Pe(),et}export{xt as W};
