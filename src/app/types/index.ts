export interface Airport {
  iataCode: string;
  name: string;
}

interface Alert {
  id: string;
  user_email: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  passengers: number;
  last_price: number;
  purchase_link: string;
  short_duration: boolean;
}

export interface PriceMetric {
  quartileRanking: string;
  amount: string;
}

export interface FlightOffer {
  price: {
    total: string;
  };
}

export interface AmadeusResponse {
  data: FlightOffer[];
}

export interface CityData {
  name: string;
  relationships?: Array<{
    type: string;
    id: string;
  }>;
}

export interface AirportsData {
  [key: string]: Airport;
}

export interface AmadeusCityResponse {
  data: CityData[];
  result: {
    included?: {
      airports?: AirportsData;
    };
  };
}