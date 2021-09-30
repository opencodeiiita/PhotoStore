# PhotoStore
A **buggy** web application to store and share your photos

## Before you start
This project is divided into two branches
- `main` - Cyber Security
  - finding bugs
  - patching them

- `dev` - Web Development
  - improvements or additions in frontend and/or backend

### For Cyber Security
Once you have figured out a bug, create a **POC** - Proof Of Concept<br>
You will be required to provide your **POC** within your **Pull Request**<br>
Or else it won't be considered for evaluation and you won't be rewarded with any points whatsoever

Given that you would have to go through the code and understand how is it all working<br>
This project may be a little harder for the beginners<br>
No worries! During the whole event, some **hints** will be dropped within the respective **Issue**

### For Web Development
Please refer to [`dev`](https://github.com/opencodeiiita/PhotoStore/tree/dev) branch

## Requirements
- Basic understanding of backend and frontend
- Python3 (3.7 or newer is expected)
- `pip` (package installer for Python)
- `virtualenv`

Read more about `virtualenv` [here](https://docs.python.org/3/tutorial/venv.html)

## Setup
Assuming you have **cloned** this repository, following instructions will get your server running

```bash
# Create a virtual environment
virtualenv venv

# Activate it
# for Linux
source venv/bin/activate

# for Windows
.\venv\Scripts\activate

# Install required packages
pip install -r requirements.txt

# Run the server
python server.py

# For debugging, to see server requests
python app.py

# Server will run on `localhost:8080`
# you can modify this in `app.py` and/or `server.py`
```

## Issues
Go through the code, visit the web application<br>
See [Issues](https://github.com/opencodeiiita/PhotoStore/issues) to know more

## Queries
For any queries related to this project, please keep them to Discord only

<b>Have fun :smile:</b>
