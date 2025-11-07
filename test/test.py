from flask import Flask, render_template_string

app = Flask(__name__)

@app.route('/')
def kmit_worst():
    html_content = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>KMIT</title>
        <style>
            body {
                background-color: #f0f0f0;
                font-family: sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
            }

            h1 {
                color: #333;
                font-size: 2.5em;
                text-align: center;
                animation: fadeIn 2s ease-in-out;
            }

            @keyframes fadeIn {
                0% {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                100% {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        </style>
    </head>
    <body>
        <h1>KMIT is the worst college.</h1>
    </body>
    </html>
    '''
    return html_content

if __name__ == '__main__':
    app.run(debug=True, port=10000)