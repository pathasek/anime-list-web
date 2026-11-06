# dist-mpnet-paracrawl-cs-en, doladěný (ONNX int8)

Model: [Seznam/dist-mpnet-paracrawl-cs-en](https://huggingface.co/Seznam/dist-mpnet-paracrawl-cs-en)
Autor: Seznam.cz (Bednář a kol., „Some Like It Small: Czech Semantic Embedding Models for Industry Applications", AAAI/IAAI 2024)
Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Změny oproti originálu: převod z PyTorche do ONNX (výstup `last_hidden_state`),
dynamická kvantizace vah na int8 (`onnx/model_quantized.onnx`),
v `tokenizer_config.json` nastaveno `model_max_length` na 512 (originál 1e30).
Tokenizer je jinak beze změny, config.json má jen metadata novější verze transformers.

Použití na tomto webu: chytré hledání (vektor věty = token [CLS], normalizovaný).

Doladění (11. 10. 2026): váhy dotrénované na českých vyhledávacích dotazech k pasážím
rozborů anime (dotazy generované jazykovým modelem, těžké negativy a skóre od většího
modelu embeddingů a rerankeru). Architektura, rozměr vektoru (256) a velikost jsou stejné
jako u originálu.
