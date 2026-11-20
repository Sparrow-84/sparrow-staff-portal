// The "Sparrow Office" location checkbox on calendar events. Ticking it saves this exact
// string as the event's location. The send-external-invite edge function looks for the
// same string to decide whether an outside invite gets the office address and parking
// instructions. If you change it here, change it there too.
export const SPARROW_OFFICE_ADDRESS = '245 SW Twin Oaks Cir, Corvallis, OR 97333';
export const SPARROW_OFFICE_LOCATION = `Sparrow Office: ${SPARROW_OFFICE_ADDRESS}`;

export function isSparrowOffice(location: string | null | undefined): boolean {
  return (location ?? '').trim() === SPARROW_OFFICE_LOCATION;
}
