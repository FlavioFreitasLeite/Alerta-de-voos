export interface Airport {
  iataCode: string;
  name: string;
}

export interface Alert {
  id: number;
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  passengers: number;
  last_price: number;
  user_email: string;
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