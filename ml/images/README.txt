Unzip the supplied archive.zip here so this folder contains:

    ml/images/modified-dataset/train/<class>/*.jpg   (240 per class)
    ml/images/modified-dataset/val/<class>/*.jpg     (30 per class)
    ml/images/modified-dataset/test/<class>/*.jpg    (30 per class)

Then retrain with:   python ml/train_image_model.py

The 3,000 images are not shipped here (18 MB, and it is your own dataset).
The TRAINED model ml/image_model.pkl IS shipped, so classification works
immediately without retraining.
