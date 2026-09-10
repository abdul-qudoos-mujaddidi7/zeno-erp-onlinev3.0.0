import{s as Na,p as O,L as ka,U as Aa,K as x,M as ht,A as t,J as $,al as ae,l as L,I as s,j as Sa,m as La,n as ne,x as o,H as r,D as R,B as n,F as u,G as ft,e as A,P as I,y as se,o as Ra,a6 as Fa,S as Pa,Z as U,Q as re,q as Ba,v as yt,u as za,T as Ea,a2 as Ia,g as F}from"./vendor-B2JKt1Tj.js";import{t as i,v as ie,l as Da,a as Wa,g as Ma,B as Ca,r as de}from"./index-CrgSFOVp.js";import{p as Ta}from"./productGenericApi-fiy0LVxF.js";import{s as oe}from"./saleApi-CmDxTUv5.js";import{a as ja}from"./accountApi-CP2vbn7r.js";import{j as qa}from"./journalApi-DXZnYAnU.js";import{A as Oa}from"./AppModal-CmaFJk6X.js";import{W as Ua}from"./WhatsappModal-DX7ib8Vb.js";import{f as Ja}from"./fetchProductsByIds-D2NLJiXR.js";import{b as gt}from"./SalesHelper-PDzQiLLh.js";import{currencyApi as Ka}from"./currencyApi-DdppgQWX.js";import"./pdf-DUrb48Xy.js";/* empty css                                               *//* empty css                                                    */var Za=F('<img alt="Company Logo" style="max-width: 100px; max-height: 50px;" class="svelte-1t19bdh"/>'),Ga=F('<div class="brand mt-2 svelte-1t19bdh"> </div>'),Ha=F('<div class="underbrand fw-bold mb-1 svelte-1t19bdh"> </div>'),Qa=F('<div class="underbrand fw-bold svelte-1t19bdh"> <!></div>'),Va=F('<div class="underbrand fw-bold svelte-1t19bdh"> </div>'),Xa=F('<div class="svelte-1t19bdh"><small class="svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"> </span></small></div>'),Ya=F('<div class="small text-muted mt-1 svelte-1t19bdh"> </div>'),tn=F('<tr class="svelte-1t19bdh"><td class="product-name fw-bold svelte-1t19bdh"><div class="svelte-1t19bdh"> </div> <!></td><td class="center fw-bold svelte-1t19bdh"><span class="fit-amount svelte-1t19bdh"> </span></td><td class="center fw-bold svelte-1t19bdh"><span class="fit-amount svelte-1t19bdh"> </span></td><td class="center fw-bold svelte-1t19bdh"><span class="fit-amount svelte-1t19bdh"> </span></td></tr>'),en=F('<div style="display:flex;justify-content:space-between;margin-top:4px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"><span dir="ltr" class="svelte-1t19bdh"> </span> </div></div> <div class="divider svelte-1t19bdh"></div> <div style="display:flex;justify-content:space-between;margin-top:4px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"></div></div>',1),an=F('<div id="receipt-content" class="receipt-preview-wrap svelte-1t19bdh"><div class="receipt svelte-1t19bdh"><div class="center svelte-1t19bdh"><!> <!> <!> <!> <!></div> <div class="divider svelte-1t19bdh"></div> <div class="mb-2 svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"></span> <small class="float-end svelte-1t19bdh"><span class="fw-bold svelte-1t19bdh"> </span></small></div> <div class="float-end svelte-1t19bdh"><small class="svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"> </span></small></div> <!> <div class="svelte-1t19bdh"><small class="svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"> </span></small></div> <table border="0" cellpadding="3" cellspacing="0" class="w-100 mt-2 svelte-1t19bdh"><thead class="svelte-1t19bdh"></thead><tbody class="svelte-1t19bdh"><tr class="svelte-1t19bdh"><th class="svelte-1t19bdh"> </th><th class="center svelte-1t19bdh"> </th><th class="center svelte-1t19bdh"> </th><th class="center svelte-1t19bdh"> </th></tr><!></tbody></table> <div class="totals small mt-3 svelte-1t19bdh"><div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div class="fw-bold svelte-1t19bdh" style="display:flex;justify-content:space-between;margin-bottom:6px;"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <!></div> <div class="divider svelte-1t19bdh"></div> <div class="center small svelte-1t19bdh"> </div> <div class="center small svelte-1t19bdh">www.zenoerp.com</div></div></div>'),nn=F('<div class="receipt-actions-grid svelte-1t19bdh"><button type="button" class="app-modal-btn app-modal-btn--secondary svelte-1t19bdh"><i class="bi bi-file-earmark-pdf svelte-1t19bdh"></i> </button> <button type="button" class="app-modal-btn receipt-whatsapp-btn svelte-1t19bdh"><i class="bi bi-whatsapp svelte-1t19bdh"></i> </button> <button type="button" class="app-modal-btn app-modal-btn--primary svelte-1t19bdh"><i class="bi bi-printer svelte-1t19bdh"></i> </button></div>'),sn=F("<!> <!>",1);function gn(le,D){Na(D,!1);const wt=()=>yt(Da,"$lang",st),xt=()=>yt(Wa,"$translate_org_type",st),tt=()=>yt(Ma,"$settings_all",st),[st,ce]=za(),ve=$(),ue=$(),$t=$(),_=$(),rt=$(),it=$(),C=$(),dt=$(),ot=$(),lt=$(),ct=$();let a=O(D,"sale",24,()=>({})),w=O(D,"items",28,()=>[]),N=O(D,"payments",28,()=>[]),P=O(D,"customer",28,()=>({})),vt=O(D,"units",28,()=>[]),J=O(D,"currencies",28,()=>[]),Nt=[],ut=$(),mt=$(null);const kt=ka();function me(){kt("close")}function pe(){kt("showA4")}function be(e={}){const d=[e.expense_amount,e.expenses_amount,e.total_expenses,e.additional_expenses,e.shipping_cost,e.delivery_cost,e.service_charge];for(const v of d){const m=Number(v);if(Number.isFinite(m))return m}return Number(e.expenses||0)||0}function _e(){const e=w().reduce((y,h)=>y+Number(h.subtotal||0),0),d=Number(gt(a())||0),v=be(a()),m=Number(a()?.total_amount??e-d+v),p=N().reduce((y,h)=>y+Number(h.amount||0),0);t(mt)?.openModal("sale_created_template",{...a(),items:w(),paid:p,due:m-p,bill_subtotal:e,discount_amount:d,expense_amount:v,payable_amount:m},P(),{})}let K=[];async function he(){if(!a()?.account_id)return;const e=[];let d=1;const v=200;for(;;){const m=await qa.getAll({status:1,account_id:a().account_id,limit:v,page:d,skip_count:1}),p=m?.data||[];if(e.push(...p),!(m?.meta||{}).hasMore||p.length<v)break;d+=1}K=e}async function fe(){const d=((await oe.getById(Number(a().id)))?.data?.items||[]).filter(p=>Number(p.status)===1).sort((p,y)=>new Date(p.created_at)-new Date(y.created_at)),[v,m]=await Promise.all([Ja(d.map(p=>p.product_id)),t($t)?Ta.getAll({status:1}):Promise.resolve({data:[]})]);Nt=m?.data||[],w(d.map(p=>{const y=v.find(h=>Number(h.id)===Number(p.product_id));return{...p,product_name:y?.name||p.product_name||"Unknown",generic_name:Nt.find(h=>Number(h.id)===Number(y?.generic_id))?.name||"",product_unit_id:p.product_unit_id||y?.product_unit_id}}))}async function ye(){const e=await oe.getById(Number(a().id));N((e?.data?.payments||[]).filter(d=>Number(d.status)===1))}async function ge(){const e=await ja.getById(a().account_id);P(e?.data||{})}async function we(){vt((await Ca.getAll({status:1}))?.data||[])}async function xe(){J((await Ka.getAll({status:1}))?.data||[])}function $e(e){let d="";return i("Lang")==="en"&&(d=e.name||""),i("Lang")==="fa"&&(d=e.name_fa||e.name||""),i("Lang")==="ps"&&(d=e.name_ps||e.name||""),d=d||"Unknown",d}Aa(async()=>{const e=[],d=(w()||[]).some(v=>v.product_name);!vt()?.length&&!d&&e.push(we()),!J()?.length&&!d&&e.push(xe()),!w()?.length&&a()?.id&&(e.push(fe()),N()?.length||e.push(ye())),!P()?.id&&a()?.account_id&&e.push(ge()),!K.length&&a()?.account_id&&e.push(he()),e.length&&await Promise.all(e),w((w()||[]).map(v=>({...v,unit_name:v.unit_name||vt().find(m=>m.id==v.product_unit_id)?.name||"",currency_symbol:v.currency_symbol||J().find(m=>m.code==a()?.currency)?.symbol||""}))),K.length&&x(Lt,ke(a().account_id,a().currency)),await ht(),pt()});function Ne(){pt();const e=document.getElementById("receipt-content").innerHTML,d=`
        <style>
          .receipt {
            width: 74mm;
            padding: 8px 4px;
            max-width: 74mm;
            overflow: hidden;
            word-wrap: break-word;
            word-break: break-word;
          }

          table {
  table-layout: fixed;
  width: 100%;
}

td, th {
  word-break: break-word;
}
         .underbrand {
    font-size: 12px;
    font-weight: 700;

    white-space: nowrap; /* ❗ FORCE ONE LINE */
    overflow: hidden;
    text-overflow: clip;

    display: block;
    width: 100%;
    text-align: center;
  }

  * {
    box-sizing: border-box;
  }


  table {
    table-layout: fixed;
    width: 100%;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 34%; /* product */
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 20%; /* qty */
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 20%; /* price */
  }

  th:nth-child(4),
  td:nth-child(4) {
    width: 26%; /* subtotal */
  }

  .product-name {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  td:nth-child(2),
  td:nth-child(3),
  td:nth-child(4) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
  }
  .fit-amount {
    display: block;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    overflow-wrap: normal;
    word-break: normal;
    line-height: 1.2;
  }


.nowrap {
  white-space: nowrap;
}
  .receipt * {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
    .underbrand {
    font-size: 12px;
    font-weight: 700;

    display: -webkit-box;
    -webkit-line-clamp: 2; /* 👈 LIMIT TO 2 LINES */
    -webkit-box-orient: vertical;

    overflow: hidden;
    word-break: break-word;
  }
body { margin: 0; }
       
table {border-bottom: 2px solid #000 !important}
td {
    border-bottom: 1px solid #000 !important;
    font-size: 9pt;
    padding: 4px 4px !important;
  }
  th {
    border-bottom: 2px solid #000 !important;
    border-top: 2px solid #000 !important;
    font-size: 11pt !important;
  }
          @page { size: 74mm auto; margin: 0; }

.underbrand { font-size: 12px; }
.center { text-align: center; }
.small { font-size: 11px; }
.divider { border-top: 1px solid #000; margin: 6px 0; }

* {color:#000000 !important;}
        </style>
      `,v=window.open("","_blank");v.document.write(`
        
        <!doctype html><html ${i("dir=ltr")}><head><meta charset="utf-8">
          
          
          
          ${d}

          <link rel='stylesheet' href='/fonts/vazirmatn.css'>
          <link rel='stylesheet' href='/css/mdb.rtl.min.css'>
          
          </head>
          <body>${e}</body></html>`),v.document.close(),v.focus(),setTimeout(()=>{v.print(),v.close()},500)}function At(e,d=12,v=6){if(!e||e.clientWidth<=0)return;e.style.whiteSpace="nowrap",e.style.overflowWrap="normal",e.style.wordBreak="normal",e.style.fontSize=d+"px";let m=v,p=d,y=v;for(;m<=p;){let h=(m+p)/2;e.style.fontSize=h+"px",e.scrollWidth<=e.clientWidth+.5?(y=h,m=h+.5):p=h-.5}e.style.fontSize=y+"px"}function pt(){At(t(ut)),document.querySelectorAll("#receipt-content .fit-amount").forEach(e=>{At(e,11,5)})}function St(e,d,v){if(!d||!v||d===v)return Number(e||0);const m=J().find(W=>W.code===d),p=J().find(W=>W.code===v);if(!m||!p)return Number(e||0);const y=Number(m.exchangeRate||1),h=Number(p.exchangeRate||1);return!Number.isFinite(y)||!Number.isFinite(h)||h<=0?Number(e||0):Number(e||0)/h*y}let Lt=$("-"),k=$({});function ke(e,d){return x(k,{}),K.forEach(v=>{if(v.first_entry_account===e){const m=v.currency||"AFN";ae(k,t(k)[m]=(t(k)[m]||0)+(Number(v.first_entry_credit||0)-Number(v.first_entry_debit||0)))}if(v.second_entry_account===e){const m=v.currency||"AFN";ae(k,t(k)[m]=(t(k)[m]||0)+(Number(v.second_entry_credit||0)-Number(v.second_entry_debit||0)))}}),console.log("Calculated balance for account",e,t(k),K.length),t(k).toString?Object.entries(t(k)).map(([v,m])=>`<span dir='ltr'>${m.toLocaleString(void 0,{maximumfractiondigits:3})}</span> ${i(v)}`).join(" "):""}L(()=>wt(),()=>{x(ve,wt())}),L(()=>xt(),()=>{x(ue,xt())}),L(()=>tt(),()=>{x($t,tt().find(e=>e.key==="enable_generics")?.value==1)}),L(()=>tt(),()=>{x(_,tt()||[])}),L(()=>s(w()),()=>{x(rt,(w()||[]).map(e=>`${e.quantity}|${e.unit_price}|${e.subtotal}|${e.unit_name}|${e.currency_symbol}`).join(";"))}),L(()=>(t(rt),ht),()=>{typeof document<"u"&&(t(rt),ht().then(pt))}),L(()=>(s(a()),s(w())),()=>{x(it,Number(a()?.total_amount||(w()&&w().length?w().reduce((e,d)=>e+(Number(d.subtotal)||0),0):0)))}),L(()=>(s(N()),s(a())),()=>{x(C,[...new Set((N()||[]).map(e=>e.currency||a()?.currency).filter(Boolean))])}),L(()=>(t(C),s(a())),()=>{x(dt,t(C).length===1?t(C)[0]:a()?.currency||"AFN")}),L(()=>(s(N()),t(C),s(a())),()=>{x(ot,N()&&N().length?t(C).length===1?N().reduce((e,d)=>e+Number(d.amount||0),0):N().reduce((e,d)=>e+St(Number(d.amount||0),d.currency||a()?.currency,a()?.currency),0):0)}),L(()=>(s(N()),s(a())),()=>{x(lt,N()&&N().length?N().reduce((e,d)=>e+St(Number(d.amount||0),d.currency||a()?.currency,a()?.currency),0):0)}),L(()=>(s(a()),t(it),t(lt)),()=>{x(ct,a()?.remaining!=null&&a()?.remaining!==""?Number(a().remaining):Number(t(it)-t(lt)))}),Sa(),La();var Rt=sn(),Ft=ne(Rt);{let e=Ea(()=>(s(i),s(a()),n(()=>`${i("Receipt")} — ${a()?.invoice_number}`)));Oa(Ft,{get title(){return t(e)},icon:"bi-printer",variant:"primary",size:"sm",$$events:{close:me},children:(d,v)=>{var m=an(),p=r(m),y=r(p),h=r(y);{var W=c=>{var l=Za();R(f=>Pa(l,"src",f),[()=>(t(_),n(()=>t(_).find(f=>f.key==="company_logo")?.value))]),A(c,l)},et=U(()=>(t(_),n(()=>t(_).find(c=>c.key==="company_logo")?.value)));I(h,c=>{t(et)&&c(W)})}var at=o(h,2);{var bt=c=>{var l=Ga(),f=r(l);R(b=>u(f,b),[()=>(t(_),n(()=>t(_).find(b=>b.key==="company_name")?.value||"Zeno ERP"))]),A(c,l)},_t=U(()=>(t(_),n(()=>t(_).find(c=>c.key==="company_name")?.value)));I(at,c=>{t(_t)&&c(bt)})}var nt=o(at,2);{var Se=c=>{var l=Ha(),f=r(l);re(l,b=>x(ut,b),()=>t(ut)),R(b=>u(f,b),[()=>(t(_),n(()=>t(_).find(b=>b.key==="company_address")?.value||"Company Address"))]),A(c,l)},Le=U(()=>(t(_),n(()=>t(_).find(c=>c.key==="company_address")?.value)));I(nt,c=>{t(Le)&&c(Se)})}var Pt=o(nt,2);{var Re=c=>{var l=Qa(),f=r(l),b=o(f);{var B=g=>{var z=Ia();R(S=>u(z,`- ${S??""}`),[()=>(t(_),n(()=>t(_).find(S=>S.key==="company_phone2")?.value||"Company Phone 2"))]),A(g,z)},E=U(()=>(t(_),n(()=>t(_).find(g=>g.key==="company_phone2")?.value)));I(b,g=>{t(E)&&g(B)})}R(g=>u(f,`${g??""} `),[()=>(t(_),n(()=>t(_).find(g=>g.key==="company_phone")?.value||"Company Phone"))]),A(c,l)},Fe=U(()=>(t(_),n(()=>t(_).find(c=>c.key==="company_phone")?.value)));I(Pt,c=>{t(Fe)&&c(Re)})}var Pe=o(Pt,2);{var Be=c=>{var l=Va(),f=r(l);R(b=>u(f,b),[()=>(t(_),n(()=>t(_).find(b=>b.key==="company_email")?.value||"Company Email"))]),A(c,l)},ze=U(()=>(t(_),n(()=>t(_).find(c=>c.key==="company_email")?.value)));I(Pe,c=>{t(ze)&&c(Be)})}var Bt=o(y,4),zt=r(Bt),Et=o(zt);se(Et,()=>(s(a()),s(de),n(()=>a()?.invoice_date?de(a()?.invoice_date.slice(0,10),"receipt"):"")),!0);var Ee=o(Et,2),Ie=r(Ee),De=r(Ie),It=o(Bt,2),We=r(It),Dt=r(We),Me=o(Dt),Ce=r(Me),Wt=o(It,2);{var Te=c=>{var l=Xa(),f=r(l),b=r(f),B=o(b),E=r(B);R((g,z,S)=>{u(b,`${g??""}
                  ${z??""}: `),u(E,S)},[()=>(s(i),n(()=>i("Number"))),()=>(s(i),n(()=>i("Account"))),()=>(s(ie),s(P()),n(()=>ie(P()?.id)||"-"))]),A(c,l)};I(Wt,c=>{s(P()),n(()=>P()?.id>1e5)&&c(Te)})}var Mt=o(Wt,2),je=r(Mt),Ct=r(je),qe=o(Ct),Oe=r(qe),Tt=o(Mt,2),Ue=o(r(Tt)),jt=r(Ue),qt=r(jt),Je=r(qt),Ot=o(qt),Ke=r(Ot),Ut=o(Ot),Ze=r(Ut),Ge=o(Ut),He=r(Ge),Qe=o(jt);Ra(Qe,1,w,Fa,(c,l)=>{var f=tn(),b=r(f),B=r(b),E=r(B),g=o(B,2);{var z=M=>{var q=Ya(),Y=r(q);R(()=>u(Y,(t(l),n(()=>t(l).generic_name)))),A(M,q)};I(g,M=>{t(l),n(()=>t(l).generic_name)&&M(z)})}var S=o(b),Z=r(S),T=r(Z),j=o(S),G=r(j),H=r(G),Q=o(j),V=r(Q),X=r(V);R((M,q,Y)=>{u(E,(t(l),n(()=>t(l).product_name))),u(T,`${M??""}
                        ${t(l),n(()=>t(l).unit_name)??""}`),u(H,`${q??""} ${t(l),n(()=>t(l).currency_symbol)??""}`),u(X,`${Y??""} ${t(l),n(()=>t(l).currency_symbol)??""}`)},[()=>(t(l),n(()=>Number(t(l).quantity).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(t(l),n(()=>Number(t(l).unit_price).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(t(l),n(()=>Number(t(l).subtotal).toLocaleString(void 0,{maximumFractionDigits:3})))]),A(c,f)});var Jt=o(Tt,2),Kt=r(Jt),Zt=r(Kt),Ve=r(Zt),Xe=o(Zt,2),Ye=r(Xe),Gt=o(Kt,2),Ht=r(Gt),ta=r(Ht),ea=o(Ht,2),aa=r(ea),Qt=o(Gt,2),Vt=r(Qt),na=r(Vt),sa=o(Vt,2),ra=r(sa),Xt=o(Qt,2),Yt=r(Xt),ia=r(Yt),da=o(Yt,2),oa=r(da),te=o(Xt,2),ee=r(te),la=r(ee),ca=o(ee,2),va=r(ca),ua=o(te,2);{var ma=c=>{var l=en(),f=ne(l),b=r(f),B=r(b),E=o(b,2),g=r(E),z=r(g),S=o(g),Z=o(f,4),T=r(Z),j=r(T),G=o(T,2);se(G,()=>t(Lt),!0),R((H,Q,V,X)=>{u(B,H),u(z,Q),g.dir=g.dir,u(S,` ${V??""}`),u(j,X)},[()=>(s(i),n(()=>i("Old Balance"))),()=>(t(k),s(a()),t(ct),n(()=>t(k)[a()?.currency]!==void 0&&t(k)[a()?.currency]!==null?Number(t(k)[a()?.currency]+t(ct)||0).toLocaleString(void 0,{maximumFractionDigits:3}):"---")),()=>(s(i),s(a()),n(()=>i(a()?.currency)||"")),()=>(s(i),n(()=>i("Now Balance")))]),A(c,l)};I(ua,c=>{s(P()),n(()=>P()?.code!="WALKIN")&&c(ma)})}var pa=o(Jt,4),ba=r(pa);R((c,l,f,b,B,E,g,z,S,Z,T,j,G,H,Q,V,X,M,q,Y,_a,ha,fa,ya,ga,wa,xa,$a)=>{u(zt,`${c??""}: `),u(De,l),u(Dt,`${f??""}: `),u(Ce,(s(a()),n(()=>a()?.invoice_number))),u(Ct,`${b??""}: `),u(Oe,B),u(Je,E),u(Ke,g),u(Ze,z),u(He,S),u(Ve,`${Z??""}${T??""}${j??""}`),u(Ye,`${G??""}
                  ${H??""}`),u(ta,`${Q??""} ${V??""}`),u(aa,`${X??""}
                  
                  ${M??""}`),u(na,q),u(ra,`${Y??""}
                  ${_a??""}`),u(ia,ha),u(oa,`${fa??""}
                  ${ya??""}`),u(la,ga),u(va,`${wa??""}
                  ${xa??""}`),u(ba,$a)},[()=>(s(i),n(()=>i("Date"))),()=>(s(a()),n(()=>a()?.invoice_date.slice(0,10))),()=>(s(i),n(()=>i("Invoice #"))),()=>(s(i),n(()=>i("Customer"))),()=>(s(P()),s(a()),n(()=>$e(P())||a()?.description||"Walk-in")),()=>(s(i),n(()=>i("Product"))),()=>(s(i),n(()=>i("Qty"))),()=>(s(i),n(()=>i("Price"))),()=>(s(i),n(()=>i("Subtotal"))),()=>(s(i),n(()=>i("Subtotal"))),()=>(s(i),n(()=>i("-of-"))),()=>(s(i),n(()=>i("Bill"))),()=>(s(w()),n(()=>w().reduce((c,l)=>c+(Number(l.subtotal)||0),0).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(s(i),s(a()),n(()=>i(a()?.currency)||"")),()=>(s(i),n(()=>i("Discount"))),()=>(s(a()),n(()=>a()?.discount_type=="percent"?`(${Number(a()?.discount_amount).toLocaleString(void 0,{maximumFractionDigits:3})}%)`:"")),()=>(s(a()),s(gt),n(()=>a()?.discount_amount?gt(a()).toLocaleString(void 0,{maximumFractionDigits:3}):0)),()=>(s(i),s(a()),n(()=>i(a()?.currency)||"")),()=>(s(i),n(()=>i("Expenses"))),()=>(s(a()),n(()=>a()?.expense_amount?Number(a()?.expense_amount).toLocaleString(void 0,{maximumFractionDigits:3}):0)),()=>(s(i),s(a()),n(()=>i(a()?.currency)||"")),()=>(s(i),n(()=>i("Payable"))),()=>(s(a()),n(()=>a()?.total_amount?Number(a()?.total_amount).toLocaleString(void 0,{maximumFractionDigits:3}):0)),()=>(s(i),s(a()),n(()=>i(a()?.currency)||"")),()=>(s(i),n(()=>i("Bill Received"))),()=>(t(ot),n(()=>Number(t(ot)||0).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(s(i),t(dt),n(()=>i(t(dt))||"")),()=>(s(i),n(()=>i("Powered by ZenoERP • Thank you!")))]),A(d,m)},$$slots:{default:!0,footer:(d,v)=>{var m=nn(),p=r(m),y=o(r(p)),h=o(p,2),W=o(r(h)),et=o(h,2),at=o(r(et));R((bt,_t,nt)=>{u(y,` ${bt??""}`),u(W,` ${_t??""}`),u(at,` ${nt??""}`)},[()=>(s(i),n(()=>i("A4"))),()=>(s(i),n(()=>i("Whatsapp"))),()=>(s(i),n(()=>i("Print")))]),ft("click",p,pe),ft("click",h,_e),ft("click",et,Ne),A(d,m)}}})}var Ae=o(Ft,2);re(Ua(Ae,{$$legacy:!0}),e=>x(mt,e),()=>t(mt)),A(le,Rt),Ba(),ce()}export{gn as default};
