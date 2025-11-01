# image_overlay.py

from PIL import Image
import io
import base64
from pathlib import Path


class ImageOverlay:
    """Class for overlaying PNG images on top of a base image."""

    def __init__(self, base_image_data):
        """
        Initialize with base image data.

        Args:
            base_image_data: PNG image data (bytes or base64 string)
        """
        self.base_image = self._load_image(base_image_data)

    def _load_image(self, image_data):
        """Load image from bytes or base64 string."""
        if isinstance(image_data, str):
            # If it's a base64 string, decode it
            image_data = base64.b64decode(image_data)

        # Open image from bytes
        return Image.open(io.BytesIO(image_data)).convert("RGBA")

    def overlay_image(self, overlay_data, position=(0, 0), resize=None, opacity=1.0):
        """
        Overlay a PNG image on the base image.

        Args:
            overlay_data: PNG image data to overlay (bytes or base64 string)
            position: Tuple (x, y) for top-left corner position
            resize: Optional tuple (width, height) to resize overlay
            opacity: Float 0.0-1.0 for overlay transparency

        Returns:
            self (for method chaining)
        """
        overlay = self._load_image(overlay_data)

        # Resize if specified
        if resize:
            overlay = overlay.resize(resize, Image.Resampling.LANCZOS)

        # Adjust opacity
        if opacity < 1.0:
            alpha = overlay.split()[3]
            alpha = alpha.point(lambda p: int(p * opacity))
            overlay.putalpha(alpha)

        # Create a copy of the base image to avoid modifying the original
        result = self.base_image.copy()

        # Paste overlay onto base image
        result.paste(overlay, position, overlay)

        # Update base image
        self.base_image = result

        return self

    def overlay_multiple(self, overlays):
        """
        Overlay multiple images at once.

        Args:
            overlays: List of dicts with keys: 'data', 'position', 'resize', 'opacity'
                     Example: [
                         {'data': png_bytes, 'position': (10, 20)},
                         {'data': png_bytes, 'position': (50, 100), 'resize': (100, 100)}
                     ]

        Returns:
            self
        """
        for overlay_config in overlays:
            self.overlay_image(
                overlay_data=overlay_config["data"],
                position=overlay_config.get("position", (0, 0)),
                resize=overlay_config.get("resize"),
                opacity=overlay_config.get("opacity", 1.0),
            )

        return self

    def get_result(self):
        """Get the final composed image as PIL Image."""
        return self.base_image

    def save(self, output_path):
        """Save the final image to a file."""
        self.base_image.save(output_path, "PNG")

    def to_bytes(self):
        """Convert the final image to PNG bytes."""
        buffer = io.BytesIO()
        self.base_image.save(buffer, format="PNG")
        return buffer.getvalue()

    def to_base64(self):
        """Convert the final image to base64 string."""
        png_bytes = self.to_bytes()
        return base64.b64encode(png_bytes).decode("utf-8")


def overlay_multiple(base_image_data, overlay_folder):
    # Get all PNG files from the folder
    overlay_files = sorted(Path(overlay_folder).glob("*.png"))

    # Load all overlay images
    overlays = []
    for overlay_file in overlay_files:
        with open(overlay_file, "rb") as f:
            overlays.append(f.read())

    composer = ImageOverlay(base_image_data=base_image_data)
    for overlay in overlays:
        composer.overlay_image(overlay, position=(0, 0))

    composer.save(f"{overlay_folder}/overlayed.png")

    return composer.to_bytes()
