import{s as st,p as pe,l as _,A as o,j as at,m as it,N as lt,G as U,$ as rt,n as pt,P as Te,e as ce,au as Se,q as ct,v as ue,u as ut,J as m,K as p,x as $,H as d,I as j,B as w,D as We,S as G,F as J,E as mt,a0 as Ee,g as Fe}from"./vendor-iM2kygSn.js";import{l as _t,a as dt,g as ft,r as Q,t as l,v as me}from"./index-q9XjAqVJ.js";/* empty css                                                    */var ht=Fe('<button type="button" class="wa-btn wa-btn--primary svelte-hvyfsn"><i class="bi bi-whatsapp" aria-hidden="true"></i> </button>'),bt=Fe('<div class="wa-overlay svelte-hvyfsn" role="presentation"><div class="wa-panel svelte-hvyfsn" role="dialog" aria-modal="true" aria-labelledby="wa-modal-title"><header class="wa-header svelte-hvyfsn"><div class="wa-header-main svelte-hvyfsn"><span class="wa-icon svelte-hvyfsn" aria-hidden="true"><i class="bi bi-whatsapp"></i></span> <h2 id="wa-modal-title" class="wa-title svelte-hvyfsn"> </h2></div> <button type="button" class="wa-close svelte-hvyfsn"><i class="bi bi-x-lg"></i></button></header> <div class="wa-body svelte-hvyfsn"><div class="wa-field svelte-hvyfsn"><label class="wa-label svelte-hvyfsn" for="wa-phone"> </label> <div class="wa-phone-row svelte-hvyfsn"><input id="wa-phone" type="text" class="wa-input svelte-hvyfsn" dir="ltr"/> <button type="button"><i class="bi bi-pencil"></i></button></div></div> <div class="wa-field svelte-hvyfsn"><label class="wa-label svelte-hvyfsn" for="wa-message"> </label> <textarea id="wa-message" class="wa-textarea svelte-hvyfsn" rows="8"></textarea></div></div> <footer class="wa-footer svelte-hvyfsn"><button type="button" class="wa-btn wa-btn--secondary svelte-hvyfsn"> </button> <!></footer></div></div>');function wt(De,L){st(L,!1);const _e=()=>ue(_t,"$lang",ne),de=()=>ue(dt,"$translate_org_type",ne),s=()=>ue(ft,"$settings_all",ne),[ne,Me]=ut(),Le=m(),Pe=m(),I=m(),fe=m(),he=m(),oe=m(),be=m(),ve=m(),ye=m(),je=m(),q=m(),we=m(),ge=m(),P=m(),R=m(),z=m(),B=m(),V=m(),X=`مشتری گرامی {{اسم مشتری}}،

✅ حساب شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📊 از این پس تمامی معاملات و گزارش‌های شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از اعتماد شما سپاسگزاریم.`,xe=`تأمین‌کننده گرامی {{اسم مشتری}}،

✅ حساب تأمین‌کننده شما در سیستم {{نام شرکت}} با موفقیت ایجاد شد.

💳 شماره حساب: {{شماره حساب}}

📦 از این پس تمامی خریدها، پرداخت‌ها، بدهی‌ها و گزارش‌های حساب شما به‌صورت منظم ثبت و قابل پیگیری خواهد بود.

در صورت نیاز به معلومات بیشتر، با ما در تماس باشید.

🏢 {{نام شرکت}}
📧 {{ایمیل شرکت}}
📞 {{شماره شرکت}} | {{شماره۲ شرکت}}
📍 {{آدرس شرکت}}

🙏 از همکاری شما سپاسگزاریم.`,$e=`🏢 {{نام شرکت}}
🗓️ {{تاریخ}}

بل فروش
🔢 شماره بل: {{شماره بل}}

محترم {{اسم حساب}}،

🛒 محصولات:
🛍️ {{محصولات}}

💰 مجموع بل: {{مجموع بل}}
🎁 تخفیف: {{تخفیف}}
💸 مصارف: {{مصارف}}
✅ مبلغ قابل پرداخت: {{رسید بل}}

🟥 بیلانس قبلی: {{بیلانس قبلی}}
⚖️ بیلانس فعلی: {{بیلانس}}

💬 توضیحات: {{توضیحات}}

🙏 از خرید و اعتماد شما سپاسگزاریم.`;let Y=pe(L,"showWhatsappModal",12,!1),A=pe(L,"message",12,""),b=pe(L,"phone",12,""),E=m(!0);const Ce="\n\n`تهیه شده توسط زینو ای آر پی`";let se=["جنوری","فبروری","مارچ","اپریل","می","جون","جولای","اگست","سپتمبر","اکتوبر","نومبر","دسمبر"];function Z(e=""){return e.startsWith("07")?"+93"+e.slice(1):e}function Oe(e=""){const n=l("dir")==="rtl"?"‏":"‎";return String(e??"").split(`
`).map(t=>{if(!t)return t;const a=t.replace(/^[\u200E\u200F]+/,"");return`${n}${a}`}).join(`
`)}function Ue(){return encodeURIComponent(Oe(A()+Ce))}function Ie(){return`whatsapp://send?phone=${String(b()||"").replace(/\D/g,"")}&text=${Ue()}`}function qe(){return"https://www.whatsapp.com/download"}function Re(e){e.preventDefault();const n=Ie(),t=qe(),a=window.open("about:blank","_blank");if(!a){window.alert("Please allow pop-ups for this website, then try again.");return}try{a.opener=null,a.document.title="Opening WhatsApp",a.document.body.innerHTML=`
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
      `}catch(r){console.warn("Could not prepare WhatsApp tab:",r)}try{a.location.href=n}catch(r){console.warn("Could not open WhatsApp protocol:",r)}window.setTimeout(()=>{try{a&&!a.closed&&a.location.replace(t)}catch{try{a&&!a.closed&&(a.location.href=t)}catch(k){console.warn("Could not open the WhatsApp download page:",k)}}},1800)}function ze(e={}){return Object.entries(e).sort(([n],[t])=>{const a={AFN:0,USD:1};return(a[n]??99)-(a[t]??99)}).map(([n,t])=>{const a=Number(typeof t=="object"?t.balance||0:t||0),r=a>=0?"طلبکار":"باقیدار";return`‎${Math.abs(a).toLocaleString(void 0,{maximumFractionDigits:3})} ${l(n)} ${r}`}).join(`
`)}function Ae(e="",n="",t={},a={}){const r=new Date().toISOString().slice(0,10),k=`
${ze(a)}`;return e.split("{{نام شرکت}}").join(o(P)).split("{{تاریخ}}").join(r).split("{{شماره حساب}}").join(me(n||t.id)).split("{{اسم مشتری}}").join(t.name||"").split("{{اسم تأمین‌کننده}}").join(t.name||"").split("{{اسم تامین‌کننده}}").join(t.name||"").split("{{اسم عرضه‌کننده}}").join(t.name||"").split("{{اسم حساب}}").join(t.name||"").split("{{نوع حساب}}").join(t.account_type_label||"").split("{{بیلانس}}").join(k).split("{{نوت}}").join(t.description||"").split("{{توضیحات}}").join(t.description||"").split("{{ایمیل شرکت}}").join(o(V)).split("{{شماره شرکت}}").join(o(R)).split("{{شماره۲ شرکت}}").join(o(z)).split("{{آدرس شرکت}}").join(o(B))}function ee(e={}){return e?l("Lang")==="fa"?e.name_fa||e.name||e.name_ps||"":l("Lang")==="ps"?e.name_ps||e.name_fa||e.name||"":e.name||e.name_fa||e.name_ps||"":""}function Be(e,n){const t=Number(e||0).toLocaleString(void 0,{maximumFractionDigits:3});return n?`${t} ${l(n)}`:t}function Ve(e={}){return Object.entries(e||{}).map(([n,t])=>`${Number(typeof t=="object"?t?.balance||0:t||0).toLocaleString(void 0,{maximumFractionDigits:3})} ${l(n)}`).join(" | ")}function v(e,n){const t=Number(e||0).toLocaleString(void 0,{maximumFractionDigits:3});return n?`${t} ${l(n)}`:t}function He(e={}){const n=[e.expense_amount,e.expenses_amount,e.total_expenses,e.additional_expenses,e.shipping_cost,e.delivery_cost,e.service_charge];for(const a of n){const r=Number(a);if(Number.isFinite(r))return r}if(Array.isArray(e.expenses))return e.expenses.reduce((a,r)=>a+Number(r?.amount??r?.expense_amount??r?.value??0),0);const t=Number(e.expenses||0);return Number.isFinite(t)?t:0}function Ne(e="account_created_template",n="",t={},a={},r={},k="",ae=null){if(A(""),b(""),p(E,!0),e=="patient_created_template")A(o(be).split("{{نام شرکت}}").join(o(P)).split("{{کد مریض}}").join(t.code).split("{{اسم مریض}}").join(t.name).split("{{ایمیل شرکت}}").join(o(V)).split("{{شماره شرکت}}").join(o(R)).split("{{شماره۲ شرکت}}").join(o(z)).split("{{آدرس شرکت}}").join(o(B))),t.phone&&b(t.phone.startsWith("07")?"+93"+t.phone.slice(1):t.phone);else if(e=="account_whatsapp_welcome_template"||e=="supplier_account_whatsapp_welcome_template"||e=="account_whatsapp_balance_template"||e=="account_whatsapp_note_template"){const y={account_whatsapp_welcome_template:o(q),supplier_account_whatsapp_welcome_template:o(oe),account_whatsapp_balance_template:o(we),account_whatsapp_note_template:o(ge)}[e]||o(q)||X;A(Ae(y,n,t,a)),b(t?.phone?Z(t.phone):"")}else if(e=="account_created_template"||e=="customer_account_created_template"||e=="supplier_account_created_template"){const i={account_created_template:o(q)||o(I),customer_account_created_template:o(q)||o(fe),supplier_account_created_template:o(oe)||o(he)};A(Ae(i[e]||o(I),n,t,a)),b(t?.phone?Z(t.phone):"")}else if(e=="journal_created_template"){const i=String(n?.date||""),y=i?Q(i,"forPDF"):["","",""],O=i?`${y[0]} ${y[1]} ${y[2]} مطابق ${i.slice(8,10)} ${se[parseInt(i.slice(5,7),10)-1]||""} ${i.slice(0,4)}`:"",f=Number(n?.first_entry_debit||0),F=Number(n?.first_entry_credit||0),u=Be(f!==0?f:F,n?.currency),T=`${f!==0?l("Debit"):l("Credit")}: ${u}`,N=ae?.invoice_number||n?.invoice_number||n?.bill_number||"-",S=ee(r)||"-",g=ee(t)||"-",D=Ve(a);A(String(o(ve)||"").split("{{نام شرکت}}").join(o(P)).split("{{تاریخ}}").join(O).split("{{مرجع}}").join(k||"").split("{{اسم حساب}}").join(g).split("{{اسم مشتری}}").join(g).split("{{شماره حساب}}").join(me(t?.id||0)).split("{{حساب همتا}}").join(S).split("{{نام حساب همتا}}").join(S).split("{{مقدار پول}}").join(T).split("{{مقدار}}").join(u).split("{{مبلغ}}").join(u).split("{{شماره بل}}").join(N).split("{{شماره فاکتور}}").join(N).split("{{بل}}").join(N).split("{{بیلانس}}").join(D).split("{{توضیحات}}").join(n?.description?`توضیحات: ${n.description}`:"").split("{{ایمیل شرکت}}").join(o(V)).split("{{شماره شرکت}}").join(o(R)).split("{{شماره۲ شرکت}}").join(o(z)).split("{{آدرس شرکت}}").join(o(B))),b(t?.phone?Z(t.phone):"")}else if(e=="appointment_created_template")A(o(ye).split("{{نام شرکت}}").join(o(P)).split("{{تاریخ}}").join(Q(n.date,"forPDF")[0]+" "+Q(n.date,"forPDF")[1]+" "+Q(n.date,"forPDF")[2]+" مطابق "+n.date.slice(8,10)+" "+se[parseInt(n.date.slice(5,7))-1]+" "+n.date.slice(0,4)).split("{{دیپارتمنت}}").join(k).split("{{اسم مریض}}").join(t.name).split("{{داکتر}}").join(r.first_name+" "+r.last_name).split("{{کد مریض}}").join(t.code).split("{{مقدار پول}}").join(l("Appointment Fee")+": "+Number(n.fee||0).toLocaleString(void 0,{maximumFractionDigits:3})+" "+l(n.currency)).split("{{شماره نوبت}}").join(n.serial_no).split("{{توضیحات}}").join(n.description?"توضیحات: "+n.description:"")),t.phone&&b(t.phone.startsWith("07")?"+93"+t.phone.slice(1):t.phone);else if(e=="sale_created_template"){const i=n||{},y=Array.isArray(i.items)?i.items:[],O=y.map((c,h)=>{const W=Number(c?.quantity||0).toLocaleString(void 0,{maximumFractionDigits:3}),H=v(c?.subtotal??Number(c?.quantity||0)*Number(c?.unit_price??c?.calculated_price??0),c?.currency||i.currency),x=c?.unit_name||c?.product_unit_name||"";return`‏${h+1}. ${c?.product_name||"-"} — ${W}${x?` ${x}`:""} — ${H}`}).join(`
`),f=String(i.invoice_date||i.date||""),F=f?Q(f,"forPDF"):["","",""],te=f?`${F[0]} ${F[1]} ${F[2]} مطابق ${f.slice(8,10)} ${se[parseInt(f.slice(5,7),10)-1]||""} ${f.slice(0,4)}`:"",u=i.currency||"AFN",T=Number(i.bill_subtotal??y.reduce((c,h)=>c+Number(h?.subtotal||0),0)),N=Number(i.discount_amount??i.discount??0),S=He(i),g=Number(i.payable_amount??i.total_amount??T-N+S),D=Number(i.paid??i.received_amount??0),M=Object.entries(a||{}).map(([c,h])=>{const W=Number(typeof h=="object"?h?.balance||0:h||0),H=Number(i.due??g-D),x=c===u?W+H:W;return v(x,c)}).join(" | "),ie=Object.entries(a||{}).map(([c,h])=>{const W=Number(typeof h=="object"?h?.balance||0:h||0);return v(W,c)}).join(" | ");A(String(o(je)||$e).split("{{نام شرکت}}").join(o(P)).split("{{تاریخ}}").join(te).split("{{اسم حساب}}").join(ee(t)||"-").split("{{اسم مشتری}}").join(ee(t)||"-").split("{{شماره حساب}}").join(me(t?.id||0)).split("{{شماره بل}}").join(i.invoice_number||"-").split("{{شماره فاکتور}}").join(i.invoice_number||"-").split("{{محصولات}}").join(O||"-").split("{{مجموع بل}}").join(v(T,u)).split("{{تخفیف}}").join(v(N,u)).split("{{مصارف}}").join(v(S,u)).split("{{هزینه}}").join(v(S,u)).split("{{رسید بل}}").join(v(g,u)).split("{{مبلغ قابل پرداخت}}").join(v(g,u)).split("{{مبلغ پرداخت شده}}").join(v(D,u)).split("{{باقی مانده}}").join(v(g-D,u)).split("{{بیلانس قبلی}}").join(M||"-").split("{{بیلانس}}").join(ie||"-").split("{{توضیحات}}").join(i.description||"").split("{{ایمیل شرکت}}").join(o(V)).split("{{شماره شرکت}}").join(o(R)).split("{{شماره۲ شرکت}}").join(o(z)).split("{{آدرس شرکت}}").join(o(B))),b(t?.phone?Z(t.phone):"")}p(E,!0),Y(!0),setTimeout(()=>{window.mdb&&(document.querySelectorAll("[data-mdb-input-init]").forEach(i=>new window.mdb.Input(i)),document.querySelectorAll(".dropdown-toggle").forEach(i=>{new window.mdb.Dropdown(i)}))},100)}function C(){Y(!1)}function Ke(e){e.target===e.currentTarget&&C()}function Ge(e){e.key==="Escape"&&Y()&&C()}_(()=>_e(),()=>{p(Le,_e())}),_(()=>de(),()=>{p(Pe,de())}),_(()=>s(),()=>{p(I,s().find(e=>e.key==="account_created_template")?.value||X)}),_(()=>s(),()=>{p(fe,s().find(e=>e.key==="customer_account_created_template")?.value||s().find(e=>e.key==="account_customer_created_template")?.value||X)}),_(()=>s(),()=>{p(he,s().find(e=>e.key==="supplier_account_created_template")?.value||s().find(e=>e.key==="account_supplier_created_template")?.value||xe)}),_(()=>s(),()=>{p(oe,s().find(e=>e.key==="supplier_account_whatsapp_welcome_template")?.value||s().find(e=>e.key==="supplier_account_created_template")?.value||xe)}),_(()=>s(),()=>{p(be,s().find(e=>e.key==="patient_created_template")?.value||"")}),_(()=>s(),()=>{p(ve,s().find(e=>e.key==="journal_created_template")?.value||"")}),_(()=>s(),()=>{p(ye,s().find(e=>e.key==="appointment_created_template")?.value||"")}),_(()=>s(),()=>{p(je,s().find(e=>e.key==="sale_created_template")?.value||$e)}),_(()=>(s(),o(I)),()=>{p(q,s().find(e=>e.key==="account_whatsapp_welcome_template")?.value||o(I)||X)}),_(()=>s(),()=>{p(we,s().find(e=>e.key==="account_whatsapp_balance_template")?.value||"")}),_(()=>s(),()=>{p(ge,s().find(e=>e.key==="account_whatsapp_note_template")?.value||"")}),_(()=>s(),()=>{p(P,s().find(e=>e.key==="company_name")?.value||"")}),_(()=>s(),()=>{p(R,s().find(e=>e.key==="company_phone")?.value||"")}),_(()=>s(),()=>{p(z,s().find(e=>e.key==="company_phone2")?.value||"")}),_(()=>s(),()=>{p(B,s().find(e=>e.key==="company_address")?.value||"")}),_(()=>s(),()=>{p(V,s().find(e=>e.key==="company_email")?.value||"")}),at();var Je={openModal:Ne,closeModal:C};it();var ke=lt();U("keydown",rt,Ge);var Qe=pt(ke);{var Xe=e=>{var n=bt(),t=d(n),a=d(t),r=d(a),k=$(d(r),2),ae=d(k),i=$(r,2),y=$(a,2),O=d(y),f=d(O),F=d(f),te=$(f,2),u=d(te),T=$(u,2);let N;var S=$(O,2),g=d(S),D=d(g),M=$(g,2),ie=$(y,2),c=d(ie),h=d(c),W=$(c,2);{var H=x=>{var K=ht(),le=$(d(K));We(re=>J(le,` ${re??""}`),[()=>(j(l),w(()=>l("Send to Whatsapp")))]),U("click",K,Re),ce(x,K)};Te(W,x=>{j(b()),w(()=>b()&&b().length>=10)&&x(H)})}We((x,K,le,re,Ze,et,tt,nt,ot)=>{G(n,"dir",x),G(t,"dir",K),J(ae,le),G(i,"aria-label",re),J(F,Ze),u.readOnly=o(E),u.dir=u.dir,N=mt(T,1,"wa-edit svelte-hvyfsn",null,N,{active:!o(E)}),G(T,"aria-label",et),J(D,tt),G(M,"dir",nt),M.readOnly=o(E),M.dir=M.dir,J(h,ot),t.dir=t.dir,n.dir=n.dir},[()=>(j(l),w(()=>l("dir"))),()=>(j(l),w(()=>l("dir"))),()=>(j(l),w(()=>l("Send Whatsapp Message"))),()=>(j(l),w(()=>l("Close"))),()=>(j(l),w(()=>l("Whatsapp Number"))),()=>(j(l),w(()=>l("Edit"))),()=>(j(l),w(()=>l("Message"))),()=>(j(l),w(()=>l("dir"))),()=>(j(l),w(()=>l("Close")))]),U("click",i,C),Ee(u,b),U("click",T,()=>{p(E,!o(E))}),Ee(M,A),U("click",c,C),U("click",n,Ke),ce(e,n)};Te(Qe,e=>{Y()&&e(Xe)})}ce(De,ke),Se(L,"openModal",Ne),Se(L,"closeModal",C);var Ye=ct(Je);return Me(),Ye}export{wt as W};
