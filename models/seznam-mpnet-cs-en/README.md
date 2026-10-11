# dist-mpnet-paracrawl-cs-en (ONNX int8)

Model: [Seznam/dist-mpnet-paracrawl-cs-en](https://huggingface.co/Seznam/dist-mpnet-paracrawl-cs-en)
Autor: Seznam.cz (Bednář a kol., „Some Like It Small: Czech Semantic Embedding Models for Industry Applications", AAAI/IAAI 2024)
Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Změny oproti originálu: převod z PyTorche do ONNX (výstup `last_hidden_state`),
dynamická kvantizace vah na int8 (`onnx/model_quantized.onnx`),
v `tokenizer_config.json` nastaveno `model_max_length` na 512 (originál 1e30).
Tokenizer a config jsou jinak beze změny.

Použití na tomto webu: chytré hledání (vektor věty = token [CLS], normalizovaný).
