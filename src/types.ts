export interface ClassItem {
  id: number;
  name: string;
  description: string;
  date?: string;
  time?: string;
  location: string;
  type: string; // "Virtual", "In-Person", or "Self-Paced"
  instructor: string;
  available_seats?: number | string;
  webAddress?: string;
}

export interface RegistrationData {
  classId: number;
  className: string;
  agentName: string;
  email: string;
  phone: string;
  marketCenter: string;
}
