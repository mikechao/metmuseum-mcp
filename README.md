[![themet logo](https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/The_Metropolitan_Museum_of_Art_Logo.svg/250px-The_Metropolitan_Museum_of_Art_Logo.svg.png)](https://www.metmuseum.org/)

# Met Museum MCP Server

A Model Context Protocol (MCP) server that provides access to the Metropolitan Museum of Art Collection through natural language interactions. This server allows AI models to search The Met's art collection and have art works available as a Resource.

## Features

This server provides AI models the following tools to interact with the art collection of The Met

### 1. List Departments (list-departments)

Lists all the valid departments at The Met

- Inputs:
  - None
- Output:
  ```
  Department ID: 1, Display Name: American Decorative Arts
  Department ID: 3, Display Name: Ancient Near Eastern Art
  ...
  ```

### 2. Search Museum Objects (search-museum-objects)

Search for various objects in The Met based on the inputs.

- Inputs:
  - `q` (string): The search term e.g. sunflowers
  - `hasImages` (boolean, optional, default: true): Only search for objects with images
  - `title` (boolean, optional, default: false): Returns objects that match the query, specifically searching against the title field for objects.
  - `departmentId` (number, optional): Returns objects that are a part of a specific department.
- Outputs:

  ```
  Total objects found: 54
  Object IDs: 436532, 789578, 436840, 438722,...
  ```

### 3. Get Museum Objects (get-museum-object)

Get a specific object from The Met containing all open access data about that object, including its image (if the image is available under Open Access).

If there is an image it is added to the Resource of the server via the title of the object.

- Inputs:
  - `objectId` (number): The id of the object to retrieve
- Outputs:
  ```
  Title: Self-Portrait with a Straw Hat (obverse: The Potato Peeler)
  Artist: Vincent van Gogh
  Artist Bio: Dutch, Zundert 1853–1890 Auvers-sur-Oise
  Department: European Paintings
  Credit Line: Bequest of Miss Adelaide Milton de Groot (1876-1967), 1967
  Medium: Oil on canvas
  Dimensions: 16 x 12 1/2 in. (40.6 x 31.8 cm)
  Primary Image URL: https://images.metmuseum.org/CRDImages/ep/original/DT1502_cropped2.jpg
  Tags: Men, Self-portraits
  **image of object in base64 encoding**
  ```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

## Disclaimer

This library is not officially associated with The Metropolitan Museum of Art in New York. It is a third-party implementation of the [The Metropolitan Museum of Art Collection API](https://metmuseum.github.io/) with a MCP Server.
