// src/services/accessControl.ts

const MAIN_ADMIN_EMAIL = "tejysjean@gmail.com";

export function isMainAdmin(authUser: any): boolean {
  return String(authUser?.email || "").trim().toLowerCase() === MAIN_ADMIN_EMAIL;
}

export function canReadBusiness(profile: any): boolean {
  return profile?.isActive === true;
}

export function canWriteBusiness(profile: any): boolean {
  return profile?.isActive === true;
}

export function canManageAccess(authUser: any): boolean {
  return isMainAdmin(authUser);
}