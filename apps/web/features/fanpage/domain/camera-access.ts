export type CameraAccessIssue='unsupported'|'denied';
/** A capability/permission read only; never prompts or opens a camera. */
export async function readCameraAccessIssue():Promise<CameraAccessIssue|null>{
 if(globalThis.isSecureContext===false||typeof navigator.mediaDevices?.getUserMedia!=='function')return 'unsupported';
 try{if(navigator.permissions?.query){const permission=await navigator.permissions.query({name:'camera' as PermissionName});if(permission.state==='denied')return 'denied';}}catch{/* Not every browser implements querying camera permission. */}
 return null;
}
