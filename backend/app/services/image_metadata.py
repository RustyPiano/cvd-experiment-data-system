import warnings
from io import BytesIO

from PIL import Image, UnidentifiedImageError


def read_image_metadata(content: bytes) -> dict:
    """Decode standard images; unrecognized native containers remain unclassified."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                metadata = {
                    "format": image.format,
                    "width": image.width,
                    "height": image.height,
                    "mode": image.mode,
                    "frames": getattr(image, "n_frames", 1),
                }
                image.verify()
            # verify() checks structure for some formats; loading catches truncated pixel data.
            with Image.open(BytesIO(content)) as image:
                image.load()
            return metadata
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        return {}
