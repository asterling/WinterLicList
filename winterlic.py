import requests
import json

class WinterliciousClient:
    def __init__(self):
        # Base API endpoint discovered in the source code
        self.api_url = "https://secure.toronto.ca/c3api_data/v2/DataAccess.svc/Licious/map_data"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        }

    def fetch_all_restaurants(self, top=1000):
        """Fetches all restaurant data including menu details."""
        params = {
            "$skip": 0,
            "$top": top
        }
        
        try:
            response = requests.get(self.api_url, params=params, headers=self.headers)
            response.raise_for_status()
            data = response.json()
            return data.get('value', [])
        except requests.exceptions.RequestException as e:
            print(f"Error fetching data: {e}")
            return []

    def download_menus(self, filename="winterlicious_menus_2026.json"):
        """Downloads and saves the full menu dataset to a JSON file."""
        restaurants = self.fetch_all_restaurants()
        if restaurants:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(restaurants, f, indent=4)
            print(f"Successfully downloaded {len(restaurants)} restaurant entries to {filename}")
        else:
            print("No data found.")

# Usage
if __name__ == "__main__":
    client = WinterliciousClient()
    client.download_menus()
