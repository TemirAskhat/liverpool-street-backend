import requests
import zipfile
import io
from overlay import ImageOverlay

# url = "https://your-bucket.s3.amazonaws.com/path/to/file.zip"


def load_file_from_s3_url(file_id, url):

    # Download zip file
    response = requests.get(url)
    buffer = io.BytesIO(response.content)

    # Extract files
    with zipfile.ZipFile(buffer) as zip_file:
        # Get all PNG files
        png_files = [f for f in zip_file.namelist() if f.lower().endswith(".png")]

        print(f"Found {len(png_files)} PNG files:")
        for png in png_files:
            print(f"  - {png}")

        # Extract all PNG files
        for png_file in png_files:
            zip_file.extract(png_file, f"extracted_files/{file_id}")

    return f"extracted_files/{file_id}"
