export interface AIState {until:number;count:number;leases:Record<string,number>}
export function admitAI(state:AIState,id:string,now:number):boolean {
 for(const [key,expires] of Object.entries(state.leases))if(expires<=now)delete state.leases[key];
 if(state.until<=now){state.until=now+86400000;state.count=0;}
 if(state.count>=20 || Object.keys(state.leases).length>=2)return false;
 state.count++;state.leases[id]=now+600000;return true;
}
