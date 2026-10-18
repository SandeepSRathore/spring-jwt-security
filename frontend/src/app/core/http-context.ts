import { HttpContextToken } from '@angular/common/http';

/** Short label shown next to the request in the request log. */
export const LOG_NOTE = new HttpContextToken<string | null>(() => null);
