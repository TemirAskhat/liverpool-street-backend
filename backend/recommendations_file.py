from openai import OpenAI
import base64
import time
import json

OPENAI_API_KEY = "your key"

PROMPT_ORIGINAL = """
There are two images: original and overlayed with imperferction areas as a help. Analyse the skin health and provide recommendations return response as JSON.
Respond fast. Be very specific and brief in recommendations like dose, frequency, regularity and amount.
Strict output format is below:
{
  "analysis": "Mild-moderate acne with",
  "recommendations": [
    {
      "step": "Cleansing",
      "active_ingredient": "Benzoyl peroxide",
      "concentration": "2.5%", // if applicable
      "dosage": "1 pump (~4–5 mL)", // if applicable
      "frequency": "Twice daily",
      "notes": "Lukewarm water; gentle massage, rinse, pat dry."
    }
  ],
  "cautions": [
    "Patch-test new products for 24–48 hours.",
    "Do not layer benzoyl peroxide "
  ],
  "disclaimer": "This is general guidance "
}
"""
PROMPT_OVERLAYED = PROMPT_ORIGINAL


def get_recommendations(base_image_data, overlayed_data):
    # Initialize the client
    client = OpenAI(api_key=OPENAI_API_KEY)

    if isinstance(base_image_data, str):
        # If already base64, use as-is
        base64_original = base_image_data
    else:
        # Convert bytes to base64
        base64_original = base64.b64encode(base_image_data).decode("utf-8")

    if isinstance(overlayed_data, str):
        # If already base64, use as-is
        base64_layered = overlayed_data
    else:
        # Convert bytes to base64
        base64_layered = base64.b64encode(overlayed_data).decode("utf-8")

    start_time = time.time()
    response = client.chat.completions.create(
        model="gpt-5-nano",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT_ORIGINAL},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_original}",
                        },
                    },
                    {"type": "text", "text": PROMPT_OVERLAYED},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_layered}",
                        },
                    },
                ],
            }
        ],
    )

    end_time = time.time()

    print("Duration OpenAI:", end_time - start_time)

    return json.loads(response.choices[0].message.content)
