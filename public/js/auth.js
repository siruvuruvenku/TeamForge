document.addEventListener('DOMContentLoaded',()=>{
  const login=document.querySelector('#login-form'),register=document.querySelector('#register-form'),alertBox=document.querySelector('#form-error');
  const showError=(message)=>{alertBox.textContent=message;alertBox.classList.add('show')};
  const submit=async(form,url)=>{form.addEventListener('submit',async(event)=>{event.preventDefault();alertBox.classList.remove('show');const button=form.querySelector('button[type="submit"]');button.disabled=true;const old=button.innerHTML;button.innerHTML='Please wait…';try{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not sign in.');location.href=data.redirect||'/dashboard'}catch(error){showError(error.message)}finally{button.disabled=false;button.innerHTML=old}})};
  if(login)submit(login,'/api/auth/login');if(register)submit(register,'/api/auth/register');
  document.querySelectorAll('.toggle-password').forEach(button=>button.addEventListener('click',()=>{const input=button.parentElement.querySelector('input');input.type=input.type==='password'?'text':'password';button.innerHTML=input.type==='password'?'<i class="bi bi-eye"></i>':'<i class="bi bi-eye-slash"></i>'}));
});
