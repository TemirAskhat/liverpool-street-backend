.PHONY: bootstrap update run clean

VENV=.venv
PYTHON=$(VENV)/bin/python3

bootstrap: $(VENV)/bin/activate

$(VENV)/bin/activate:
	python3 -m venv $(VENV)
	$(PYTHON) -m pip install -r requirements.txt

update: bootstrap
	$(PYTHON) -m pip install -U -r requirements.txt

run: bootstrap
	$(PYTHON) main.py

clean: bootstrap
	rm -r .venv