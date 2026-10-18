const byId = (id) => document.getElementById(id);
const inquiryInbox = 'mglabsco@gmail.com';
function customerDetails(){return {name:byId('customerName').value.trim(),email:byId('customerEmail').value.trim(),phone:byId('customerPhone').value.trim(),company:byId('customerCompany').value.trim(),notes:byId('customerNotes').value.trim()};}
function quoteLines(customer){
  const s=window.CaseCraft.getState();
  const sizes={cabin:{name:'Cabin',price:8999,dimensions:'55 x 35 x 23 cm'},medium:{name:'Medium',price:11999,dimensions:'66 x 45 x 27 cm'},large:{name:'Large',price:14999,dimensions:'76 x 51 x 30 cm'}};
  const colors={black:'Midnight black',cream:'Oat cream',sage:'Sage green',navy:'Deep ocean',terracotta:'Burnt sienna'};
  const hardware={onyx:'Onyx',silver:'Silver',gold:'Champagne'};
  const items=[['Suitcase — '+sizes[s.size].name,sizes[s.size].price]];
  if(s.finish==='gloss')items.push(['High-gloss shell finish',500]);
  if(s.hardware==='silver')items.push(['Silver hardware',300]);
  if(s.hardware==='gold')items.push(['Champagne hardware',700]);
  if(s.tag)items.push(['Personalized luggage tag',499]);
  const total=items.reduce((sum,item)=>sum+item[1],0);
  const lines=['CASECRAFT | PERSONALIZED QUOTATION','Quote reference: CC-'+Date.now().toString().slice(-8),'Prepared: '+new Date().toLocaleDateString('en-IN'),'','CUSTOMER DETAILS','Name: '+(customer.name||'Not provided'),'Email: '+(customer.email||'Not provided'),'Phone: '+(customer.phone||'Not provided'),'Company: '+(customer.company||'Not provided'),'','CONFIGURATION','Shade: '+colors[s.color],'Finish: '+(s.finish==='matte'?'Soft matte':'High gloss'),'Hardware: '+hardware[s.hardware],'Size: '+sizes[s.size].name+' — '+sizes[s.size].dimensions,'Monogram: '+(s.showMonogram&&s.monogram?s.monogram:'None'),'Personalized luggage tag: '+(s.tag?'Included':'No'),'','PRICE BREAKDOWN'];
  items.forEach(item=>lines.push(item[0]+': INR '+item[1].toLocaleString('en-IN')));
  lines.push('Estimated total: INR '+total.toLocaleString('en-IN'),'','Additional notes: '+(customer.notes||'None'),'','Indicative portfolio-demo quotation only. Availability and final pricing require confirmation. This is not a tax invoice or confirmed order.');
  return {text:lines.join(String.fromCharCode(10)),items,total,reference:'CC-'+Date.now().toString().slice(-8)};
}
async function downloadQuote(){
  const form=byId('quoteForm');if(!form.reportValidity())return;
  const quote=quoteLines(customerDetails());const filename='CaseCraft-Quote-'+quote.reference;
  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    const doc=new mod.jsPDF({unit:'mm',format:'a4'});let y=20;
    doc.setTextColor(42,45,38);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('CASECRAFT',18,y);y+=8;
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('PERSONALIZED SUITCASE QUOTATION',18,y);y+=10;doc.setDrawColor(190,190,178);doc.line(18,y,192,y);y+=9;
    quote.text.split(String.fromCharCode(10)).forEach(line=>{if(y>276){doc.addPage();y=20;}if(['CUSTOMER DETAILS','CONFIGURATION','PRICE BREAKDOWN'].includes(line)){y+=2;doc.setFont('helvetica','bold');doc.setFontSize(10);}else{doc.setFont('helvetica','normal');doc.setFontSize(9);}const wrapped=doc.splitTextToSize(line||' ',174);doc.text(wrapped,18,y);y+=wrapped.length*5;});
    doc.save(filename+'.pdf');window.dispatchEvent(new CustomEvent('casecraft-toast',{detail:'Quotation PDF downloaded.'}));
  }catch(err){
    const blob=new Blob([quote.text],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename+'.txt';a.click();URL.revokeObjectURL(a.href);window.dispatchEvent(new CustomEvent('casecraft-toast',{detail:'PDF service unavailable; quotation downloaded as text.'}));
  }
}
function submitInquiry(event){
  event.preventDefault();const form=byId('quoteForm');if(!form.reportValidity())return;
  const customer=customerDetails(),quote=quoteLines(customer);
  const inquiry={reference:quote.reference,createdAt:new Date().toISOString(),customer,configuration:window.CaseCraft.getState(),quotation:quote.text};
  try{const saved=JSON.parse(localStorage.getItem('casecraft-inquiries')||'[]');saved.push(inquiry);localStorage.setItem('casecraft-inquiries',JSON.stringify(saved.slice(-20)));}catch(e){}
  const subject='CaseCraft order inquiry — '+quote.reference;
  const body='Hello MG Labs Co,\n\nI would like to enquire about this custom suitcase.\n\n'+quote.text+'\n\nPlease contact me with availability and next steps.';
  const mailto='mailto:'+inquiryInbox+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  window.location.href=mailto;
  window.dispatchEvent(new CustomEvent('casecraft-toast',{detail:'Inquiry prepared. Review and send it in your email app.'}));
}
window.downloadQuote=downloadQuote;
window.submitInquiry=submitInquiry;
window.addEventListener('casecraft-toast',e=>{const el=byId('toast');if(!el)return;el.textContent=e.detail;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800);});