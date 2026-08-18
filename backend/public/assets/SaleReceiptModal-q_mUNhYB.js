import{s as ma,p as q,L as ba,U as pa,K as N,M as _a,A as t,J as $,ak as Jt,l as z,I as r,j as ha,m as fa,x as o,H as s,D as L,B as a,F as v,G as Zt,e as S,P as I,y as Gt,o as ya,a6 as ga,S as wa,Z as W,Q as xa,n as Na,q as $a,v as vt,u as ka,T as Aa,a2 as La,g as D}from"./vendor-iM2kygSn.js";import{t as n,v as Ht,l as Sa,a as Da,g as Ra,B as Pa,r as Kt}from"./index-HEZvtMQy.js";import{p as Fa}from"./productGenericApi-CtWgkI3p.js";import{s as Qt}from"./saleApi-DUl-2BMm.js";import{a as za}from"./accountApi-B5-B0ISX.js";import{j as Ba}from"./journalApi-B04c-G-P.js";import{A as Ia}from"./AppModal-7ZqfeP2h.js";import{f as Ea}from"./fetchProductsByIds-BYLwlUNt.js";import{b as Vt}from"./SalesHelper-BaqvxVY-.js";import{currencyApi as Ca}from"./currencyApi-B_7bnxUl.js";import"./pdf-Bvts5QDW.js";/* empty css                                               */var Ma=D('<img alt="Company Logo" style="max-width: 100px; max-height: 50px;" class="svelte-1t19bdh"/>'),Ta=D('<div class="brand mt-2 svelte-1t19bdh"> </div>'),ja=D('<div class="underbrand fw-bold mb-1 svelte-1t19bdh"> </div>'),Oa=D('<div class="underbrand fw-bold svelte-1t19bdh"> <!></div>'),Ua=D('<div class="underbrand fw-bold svelte-1t19bdh"> </div>'),qa=D('<div class="svelte-1t19bdh"><small class="svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"> </span></small></div>'),Wa=D('<div class="small text-muted mt-1 svelte-1t19bdh"> </div>'),Ja=D('<tr class="svelte-1t19bdh"><td class="product-name fw-bold svelte-1t19bdh"><div class="svelte-1t19bdh"> </div> <!></td><td class="center fw-bold svelte-1t19bdh"><span class="svelte-1t19bdh"> </span></td><td class="center fw-bold svelte-1t19bdh"><span class="svelte-1t19bdh"> </span></td><td class="center fw-bold svelte-1t19bdh"><span class="svelte-1t19bdh"> </span></td></tr>'),Za=D('<div style="display:flex;justify-content:space-between;margin-top:4px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"><span dir="ltr" class="svelte-1t19bdh"> </span> </div></div> <div class="divider svelte-1t19bdh"></div> <div style="display:flex;justify-content:space-between;margin-top:4px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"></div></div>',1),Ga=D('<div id="receipt-content" class="receipt-preview-wrap svelte-1t19bdh"><div class="receipt svelte-1t19bdh"><div class="center svelte-1t19bdh"><!> <!> <!> <!> <!></div> <div class="divider svelte-1t19bdh"></div> <div class="mb-2 svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"></span> <small class="float-end svelte-1t19bdh"><span class="fw-bold svelte-1t19bdh"> </span></small></div> <div class="float-end svelte-1t19bdh"><small class="svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"> </span></small></div> <!> <div class="svelte-1t19bdh"><small class="svelte-1t19bdh"> <span class="fw-bold svelte-1t19bdh"> </span></small></div> <table border="0" cellpadding="3" cellspacing="0" class="w-100 mt-2 svelte-1t19bdh"><thead class="svelte-1t19bdh"></thead><tbody class="svelte-1t19bdh"><tr class="svelte-1t19bdh"><th class="svelte-1t19bdh"> </th><th class="center svelte-1t19bdh"> </th><th class="center svelte-1t19bdh"> </th><th class="center svelte-1t19bdh"> </th></tr><!></tbody></table> <div class="totals small mt-3 svelte-1t19bdh"><div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div style="display:flex;justify-content:space-between;margin-bottom:6px;" class="svelte-1t19bdh"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <div class="fw-bold svelte-1t19bdh" style="display:flex;justify-content:space-between;margin-bottom:6px;"><div class="fw-bold svelte-1t19bdh"> </div> <div class="right fw-bold svelte-1t19bdh"> </div></div> <!></div> <div class="divider svelte-1t19bdh"></div> <div class="center small svelte-1t19bdh"> </div> <div class="center small svelte-1t19bdh">www.zenoerp.com</div></div></div>'),Ha=D('<div class="receipt-actions-grid svelte-1t19bdh"><button type="button" class="app-modal-btn app-modal-btn--secondary svelte-1t19bdh"><i class="bi bi-file-earmark-pdf svelte-1t19bdh"></i> </button> <button type="button" class="app-modal-btn app-modal-btn--primary svelte-1t19bdh"><i class="bi bi-printer svelte-1t19bdh"></i> </button></div>');function ds(Xt,E){ma(E,!1);const ut=()=>vt(Sa,"$lang",at),mt=()=>vt(Da,"$translate_org_type",at),tt=()=>vt(Ra,"$settings_all",at),[at,Yt]=ka(),te=$(),ee=$(),bt=$(),_=$(),st=$(),T=$(),rt=$(),nt=$(),it=$(),dt=$();let e=q(E,"sale",24,()=>({})),k=q(E,"items",28,()=>[]),x=q(E,"payments",28,()=>[]),R=q(E,"customer",28,()=>({})),lt=q(E,"units",28,()=>[]),J=q(E,"currencies",28,()=>[]),pt=[],ot=$();const _t=ba();function ae(){_t("close")}function se(){_t("showA4")}let Z=[];async function re(){if(!e()?.account_id)return;const i=[];let c=1;const u=200;for(;;){const m=await Ba.getAll({status:1,account_id:e().account_id,limit:u,page:c,skip_count:1}),b=m?.data||[];if(i.push(...b),!(m?.meta||{}).hasMore||b.length<u)break;c+=1}Z=i}async function ne(){const c=((await Qt.getById(Number(e().id)))?.data?.items||[]).filter(b=>Number(b.status)===1).sort((b,g)=>new Date(b.created_at)-new Date(g.created_at)),[u,m]=await Promise.all([Ea(c.map(b=>b.product_id)),t(bt)?Fa.getAll({status:1}):Promise.resolve({data:[]})]);pt=m?.data||[],k(c.map(b=>{const g=u.find(y=>Number(y.id)===Number(b.product_id));return{...b,product_name:g?.name||b.product_name||"Unknown",generic_name:pt.find(y=>Number(y.id)===Number(g?.generic_id))?.name||"",product_unit_id:b.product_unit_id||g?.product_unit_id}}))}async function ie(){const i=await Qt.getById(Number(e().id));x((i?.data?.payments||[]).filter(c=>Number(c.status)===1))}async function de(){const i=await za.getById(e().account_id);R(i?.data||{})}async function le(){lt((await Pa.getAll({status:1}))?.data||[])}async function oe(){J((await Ca.getAll({status:1}))?.data||[])}function ce(i){let c="";return n("Lang")==="en"&&(c=i.name||""),n("Lang")==="fa"&&(c=i.name_fa||i.name||""),n("Lang")==="ps"&&(c=i.name_ps||i.name||""),c=c||"Unknown",c}pa(async()=>{const i=[],c=(k()||[]).some(u=>u.product_name);!lt()?.length&&!c&&i.push(le()),!J()?.length&&!c&&i.push(oe()),!k()?.length&&e()?.id&&(i.push(ne()),x()?.length||i.push(ie())),!R()?.id&&e()?.account_id&&i.push(de()),!Z.length&&e()?.account_id&&i.push(re()),i.length&&await Promise.all(i),k((k()||[]).map(u=>({...u,unit_name:u.unit_name||lt().find(m=>m.id==u.product_unit_id)?.name||"",currency_symbol:u.currency_symbol||J().find(m=>m.code==e()?.currency)?.symbol||""}))),Z.length&&N(ft,me(e().account_id,e().currency)),await _a(),ue(t(ot))});function ve(){const i=document.getElementById("receipt-content").innerHTML,c=`
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
    width: 40%; /* product */
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
    width: 20%; /* subtotal */
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
    text-overflow: ellipsis;
    font-size: 8pt;
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
    font-size: 9pt !important;
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
      `,u=window.open("","_blank");u.document.write(`
        
        <!doctype html><html ${n("dir=ltr")}><head><meta charset="utf-8">
          
          
          
          ${c}

          <link rel='stylesheet' href='/fonts/vazirmatn.css'>
          <link rel='stylesheet' href='/css/mdb.rtl.min.css'>
          
          </head>
          <body>${i}</body></html>`),u.document.close(),u.focus(),setTimeout(()=>{u.print(),u.close()},500)}function ue(i,c=12,u=6){if(!i)return;let m=u,b=c,g=u;for(;m<=b;){let y=(m+b)/2;i.style.fontSize=y+"px",i.scrollWidth<=i.clientWidth?(g=y,m=y+.5):b=y-.5}i.style.fontSize=g+"px"}function ht(i,c,u){if(!c||!u||c===u)return Number(i||0);const m=J().find(C=>C.code===c),b=J().find(C=>C.code===u);if(!m||!b)return Number(i||0);const g=Number(m.exchangeRate||1),y=Number(b.exchangeRate||1);return!Number.isFinite(g)||!Number.isFinite(y)||y<=0?Number(i||0):Number(i||0)/y*g}let ft=$("-"),w=$({});function me(i,c){return N(w,{}),Z.forEach(u=>{if(u.first_entry_account===i){const m=u.currency||"AFN";Jt(w,t(w)[m]=(t(w)[m]||0)+(Number(u.first_entry_credit||0)-Number(u.first_entry_debit||0)))}if(u.second_entry_account===i){const m=u.currency||"AFN";Jt(w,t(w)[m]=(t(w)[m]||0)+(Number(u.second_entry_credit||0)-Number(u.second_entry_debit||0)))}}),console.log("Calculated balance for account",i,t(w),Z.length),t(w).toString?Object.entries(t(w)).map(([u,m])=>`<span dir='ltr'>${m.toLocaleString(void 0,{maximumfractiondigits:3})}</span> ${n(u)}`).join(" "):""}z(()=>ut(),()=>{N(te,ut())}),z(()=>mt(),()=>{N(ee,mt())}),z(()=>tt(),()=>{N(bt,tt().find(i=>i.key==="enable_generics")?.value==1)}),z(()=>tt(),()=>{N(_,tt()||[])}),z(()=>(r(e()),r(k())),()=>{N(st,Number(e()?.total_amount||(k()&&k().length?k().reduce((i,c)=>i+(Number(c.subtotal)||0),0):0)))}),z(()=>(r(x()),r(e())),()=>{N(T,[...new Set((x()||[]).map(i=>i.currency||e()?.currency).filter(Boolean))])}),z(()=>(t(T),r(e())),()=>{N(rt,t(T).length===1?t(T)[0]:e()?.currency||"AFN")}),z(()=>(r(x()),t(T),r(e())),()=>{N(nt,x()&&x().length?t(T).length===1?x().reduce((i,c)=>i+Number(c.amount||0),0):x().reduce((i,c)=>i+ht(Number(c.amount||0),c.currency||e()?.currency,e()?.currency),0):0)}),z(()=>(r(x()),r(e())),()=>{N(it,x()&&x().length?x().reduce((i,c)=>i+ht(Number(c.amount||0),c.currency||e()?.currency,e()?.currency),0):0)}),z(()=>(r(e()),t(st),t(it)),()=>{N(dt,e()?.remaining!=null&&e()?.remaining!==""?Number(e().remaining):Number(t(st)-t(it)))}),ha(),fa();{let i=Aa(()=>(r(n),r(e()),a(()=>`${n("Receipt")} — ${e()?.invoice_number}`)));Ia(Xt,{get title(){return t(i)},icon:"bi-printer",variant:"primary",size:"sm",$$events:{close:ae},children:(c,u)=>{var m=Ga(),b=s(m),g=s(b),y=s(g);{var C=l=>{var d=Ma();L(h=>wa(d,"src",h),[()=>(t(_),a(()=>t(_).find(h=>h.key==="company_logo")?.value))]),S(l,d)},ct=W(()=>(t(_),a(()=>t(_).find(l=>l.key==="company_logo")?.value)));I(y,l=>{t(ct)&&l(C)})}var et=o(y,2);{var be=l=>{var d=Ta(),h=s(d);L(p=>v(h,p),[()=>(t(_),a(()=>t(_).find(p=>p.key==="company_name")?.value||"Zeno ERP"))]),S(l,d)},pe=W(()=>(t(_),a(()=>t(_).find(l=>l.key==="company_name")?.value)));I(et,l=>{t(pe)&&l(be)})}var yt=o(et,2);{var _e=l=>{var d=ja(),h=s(d);xa(d,p=>N(ot,p),()=>t(ot)),L(p=>v(h,p),[()=>(t(_),a(()=>t(_).find(p=>p.key==="company_address")?.value||"Company Address"))]),S(l,d)},he=W(()=>(t(_),a(()=>t(_).find(l=>l.key==="company_address")?.value)));I(yt,l=>{t(he)&&l(_e)})}var gt=o(yt,2);{var fe=l=>{var d=Oa(),h=s(d),p=o(h);{var P=f=>{var F=La();L(A=>v(F,`- ${A??""}`),[()=>(t(_),a(()=>t(_).find(A=>A.key==="company_phone2")?.value||"Company Phone 2"))]),S(f,F)},B=W(()=>(t(_),a(()=>t(_).find(f=>f.key==="company_phone2")?.value)));I(p,f=>{t(B)&&f(P)})}L(f=>v(h,`${f??""} `),[()=>(t(_),a(()=>t(_).find(f=>f.key==="company_phone")?.value||"Company Phone"))]),S(l,d)},ye=W(()=>(t(_),a(()=>t(_).find(l=>l.key==="company_phone")?.value)));I(gt,l=>{t(ye)&&l(fe)})}var ge=o(gt,2);{var we=l=>{var d=Ua(),h=s(d);L(p=>v(h,p),[()=>(t(_),a(()=>t(_).find(p=>p.key==="company_email")?.value||"Company Email"))]),S(l,d)},xe=W(()=>(t(_),a(()=>t(_).find(l=>l.key==="company_email")?.value)));I(ge,l=>{t(xe)&&l(we)})}var wt=o(g,4),xt=s(wt),Nt=o(xt);Gt(Nt,()=>(r(e()),r(Kt),a(()=>e()?.invoice_date?Kt(e()?.invoice_date.slice(0,10),"receipt"):"")),!0);var Ne=o(Nt,2),$e=s(Ne),ke=s($e),$t=o(wt,2),Ae=s($t),kt=s(Ae),Le=o(kt),Se=s(Le),At=o($t,2);{var De=l=>{var d=qa(),h=s(d),p=s(h),P=o(p),B=s(P);L((f,F,A)=>{v(p,`${f??""}
                  ${F??""}: `),v(B,A)},[()=>(r(n),a(()=>n("Number"))),()=>(r(n),a(()=>n("Account"))),()=>(r(Ht),r(R()),a(()=>Ht(R()?.id)||"-"))]),S(l,d)};I(At,l=>{r(R()),a(()=>R()?.id>1e5)&&l(De)})}var Lt=o(At,2),Re=s(Lt),St=s(Re),Pe=o(St),Fe=s(Pe),Dt=o(Lt,2),ze=o(s(Dt)),Rt=s(ze),Pt=s(Rt),Be=s(Pt),Ft=o(Pt),Ie=s(Ft),zt=o(Ft),Ee=s(zt),Ce=o(zt),Me=s(Ce),Te=o(Rt);ya(Te,1,k,ga,(l,d)=>{var h=Ja(),p=s(h),P=s(p),B=s(P),f=o(P,2);{var F=M=>{var U=Wa(),Y=s(U);L(()=>v(Y,(t(d),a(()=>t(d).generic_name)))),S(M,U)};I(f,M=>{t(d),a(()=>t(d).generic_name)&&M(F)})}var A=o(p),G=s(A),j=s(G),O=o(A),H=s(O),K=s(H),Q=o(O),V=s(Q),X=s(V);L((M,U,Y)=>{v(B,(t(d),a(()=>t(d).product_name))),v(j,`${M??""}
                        ${t(d),a(()=>t(d).unit_name)??""}`),v(K,`${U??""} ${t(d),a(()=>t(d).currency_symbol)??""}`),v(X,`${Y??""} ${t(d),a(()=>t(d).currency_symbol)??""}`)},[()=>(t(d),a(()=>Number(t(d).quantity).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(t(d),a(()=>Number(t(d).unit_price).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(t(d),a(()=>Number(t(d).subtotal).toLocaleString(void 0,{maximumFractionDigits:3})))]),S(l,h)});var Bt=o(Dt,2),It=s(Bt),Et=s(It),je=s(Et),Oe=o(Et,2),Ue=s(Oe),Ct=o(It,2),Mt=s(Ct),qe=s(Mt),We=o(Mt,2),Je=s(We),Tt=o(Ct,2),jt=s(Tt),Ze=s(jt),Ge=o(jt,2),He=s(Ge),Ot=o(Tt,2),Ut=s(Ot),Ke=s(Ut),Qe=o(Ut,2),Ve=s(Qe),qt=o(Ot,2),Wt=s(qt),Xe=s(Wt),Ye=o(Wt,2),ta=s(Ye),ea=o(qt,2);{var aa=l=>{var d=Za(),h=Na(d),p=s(h),P=s(p),B=o(p,2),f=s(B),F=s(f),A=o(f),G=o(h,4),j=s(G),O=s(j),H=o(j,2);Gt(H,()=>t(ft),!0),L((K,Q,V,X)=>{v(P,K),v(F,Q),f.dir=f.dir,v(A,` ${V??""}`),v(O,X)},[()=>(r(n),a(()=>n("Old Balance"))),()=>(t(w),r(e()),t(dt),a(()=>t(w)[e()?.currency]!==void 0&&t(w)[e()?.currency]!==null?Number(t(w)[e()?.currency]+t(dt)||0).toLocaleString(void 0,{maximumFractionDigits:3}):"---")),()=>(r(n),r(e()),a(()=>n(e()?.currency)||"")),()=>(r(n),a(()=>n("Now Balance")))]),S(l,d)};I(ea,l=>{r(R()),a(()=>R()?.code!="WALKIN")&&l(aa)})}var sa=o(Bt,4),ra=s(sa);L((l,d,h,p,P,B,f,F,A,G,j,O,H,K,Q,V,X,M,U,Y,na,ia,da,la,oa,ca,va,ua)=>{v(xt,`${l??""}: `),v(ke,d),v(kt,`${h??""}: `),v(Se,(r(e()),a(()=>e()?.invoice_number))),v(St,`${p??""}: `),v(Fe,P),v(Be,B),v(Ie,f),v(Ee,F),v(Me,A),v(je,`${G??""}${j??""}${O??""}`),v(Ue,`${H??""}
                  ${K??""}`),v(qe,`${Q??""} ${V??""}`),v(Je,`${X??""}
                  
                  ${M??""}`),v(Ze,U),v(He,`${Y??""}
                  ${na??""}`),v(Ke,ia),v(Ve,`${da??""}
                  ${la??""}`),v(Xe,oa),v(ta,`${ca??""}
                  ${va??""}`),v(ra,ua)},[()=>(r(n),a(()=>n("Date"))),()=>(r(e()),a(()=>e()?.invoice_date.slice(0,10))),()=>(r(n),a(()=>n("Invoice #"))),()=>(r(n),a(()=>n("Customer"))),()=>(r(R()),r(e()),a(()=>ce(R())||e()?.description||"Walk-in")),()=>(r(n),a(()=>n("Product"))),()=>(r(n),a(()=>n("Qty"))),()=>(r(n),a(()=>n("Price"))),()=>(r(n),a(()=>n("Subtotal"))),()=>(r(n),a(()=>n("Subtotal"))),()=>(r(n),a(()=>n("-of-"))),()=>(r(n),a(()=>n("Bill"))),()=>(r(k()),a(()=>k().reduce((l,d)=>l+(Number(d.subtotal)||0),0).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(r(n),r(e()),a(()=>n(e()?.currency)||"")),()=>(r(n),a(()=>n("Discount"))),()=>(r(e()),a(()=>e()?.discount_type=="percent"?`(${Number(e()?.discount_amount).toLocaleString(void 0,{maximumFractionDigits:3})}%)`:"")),()=>(r(e()),r(Vt),a(()=>e()?.discount_amount?Vt(e()).toLocaleString(void 0,{maximumFractionDigits:3}):0)),()=>(r(n),r(e()),a(()=>n(e()?.currency)||"")),()=>(r(n),a(()=>n("Expenses"))),()=>(r(e()),a(()=>e()?.expense_amount?Number(e()?.expense_amount).toLocaleString(void 0,{maximumFractionDigits:3}):0)),()=>(r(n),r(e()),a(()=>n(e()?.currency)||"")),()=>(r(n),a(()=>n("Payable"))),()=>(r(e()),a(()=>e()?.total_amount?Number(e()?.total_amount).toLocaleString(void 0,{maximumFractionDigits:3}):0)),()=>(r(n),r(e()),a(()=>n(e()?.currency)||"")),()=>(r(n),a(()=>n("Bill Received"))),()=>(t(nt),a(()=>Number(t(nt)||0).toLocaleString(void 0,{maximumFractionDigits:3}))),()=>(r(n),t(rt),a(()=>n(t(rt))||"")),()=>(r(n),a(()=>n("Powered by ZenoERP • Thank you!")))]),S(c,m)},$$slots:{default:!0,footer:(c,u)=>{var m=Ha(),b=s(m),g=o(s(b)),y=o(b,2),C=o(s(y));L((ct,et)=>{v(g,` ${ct??""}`),v(C,` ${et??""}`)},[()=>(r(n),a(()=>n("A4"))),()=>(r(n),a(()=>n("Print")))]),Zt("click",b,se),Zt("click",y,ve),S(c,m)}}})}$a(),Yt()}export{ds as default};
