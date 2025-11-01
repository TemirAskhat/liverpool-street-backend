from openai import OpenAI
import base64

OPENAI_API_KEY = "YOUR-key"

PROMPT = "Provide recommendations for skin care"


def get_recommendations(base_image_data, overlayed_data, prompt=PROMPT):
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

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_original}",
                        },
                    },
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_layered}",
                        },
                    },
                ],
            }
        ],
        max_tokens=500,
    )

    return response.choices[0].message.content
