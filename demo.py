from markitdown import MarkItDown

def main():
    md = MarkItDown()
    result = md.convert("test_input.html")
    print("--- Converted Content ---")
    print(result.text_content)
    print("-----------------------")

if __name__ == "__main__":
    main()
